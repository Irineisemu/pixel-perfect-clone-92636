# Plano — Modalidade "Advogado" (lawyer) no JusRadar

## Suposições importantes (divergências do brief)

O brief pede **Supabase Edge Functions (Deno)**, mas este projeto roda em **TanStack Start sobre Cloudflare Workers** e o stack já estabelecido é:

- `createServerFn` em `src/lib/*.functions.ts` (RPC tipado)
- Server routes em `src/routes/api/public/*` (cron / webhooks)
- pg_cron já bate em `/api/public/ingestion/tick` com header `apikey` = `SUPABASE_PUBLISHABLE_KEY`
- Front em React + Tailwind, componentes em `src/components/`, página de alvos em `src/pages/Alvos.tsx` (legacy `@ts-nocheck`, ainda usa `Mock`)
- Não existe `EdgeRuntime.waitUntil` no runtime atual
- Tabela `discovery_runs` não existe; `process_updates` não tem coluna `is_initial_discovery`; `target_process_links` não tem `matched_via/matched_value/unlinked_at`
- DataJudAdapter já existe em `src/ingestion/adapters/datajud/` com rate limit, cache e mapper

**Decisão:** manter a arquitetura do projeto. Tudo vira `createServerFn` + server routes; a "execução em background" é modelada como **jobs na fila já existente** (`ingestion_jobs` com novo `kind`), processados a cada 1 min pelo tick. UI usa Realtime em `discovery_runs` para progresso. Funcionalmente equivalente ao spec, sem inventar runtime.

Tribunal: TJRJ apenas (`api_publica_tjrj`). Sem scraping, sem outros tribunais.

---

## Ordem de implementação

1. Migration (schema + RLS)
2. Tipos compartilhados
3. Adapter: busca por OAB no DataJud (extensão do `DataJudAdapter`)
4. Server functions: criação do target lawyer, status, trigger manual, worker de descoberta
5. Server route: `/api/public/discovery/refresh` para o cron diário
6. pg_cron schedule
7. Componentes UI: `OABInput`, hook `useDiscoveryStatus`, `LawyerTargetForm`, página `DiscoveryProgress`
8. Integração nas telas existentes (modal de criação, listagem `/alvos`, feed)
9. Rota `/alvos/$targetId/descoberta` + Realtime habilitado

---

## Bloco 1 — Migration

`supabase/migrations/<ts>_add_lawyer_target.sql`

- Estende enum/CHECK de `monitoring_targets.type` para incluir `'lawyer'`
- Adiciona em `monitoring_targets`: `oab_numbers TEXT[]`, `lawyer_name TEXT`, `include_inactive BOOLEAN DEFAULT false`, `tribunal_scope TEXT[] DEFAULT '{api_publica_tjrj}'`, `auto_discovered BOOLEAN DEFAULT false`, `last_discovery_at TIMESTAMPTZ`, `discovery_status TEXT CHECK (... 'pending'|'running'|'completed'|'failed'|'partial')`
- Constraint `valid_lawyer` (oab 1–10, nome ≥3)
- Índice GIN parcial em `oab_numbers WHERE type='lawyer'`
- Cria `discovery_runs` com FKs, RLS por `user_id`, índices
- Cria enum `discovery_trigger`
- Em `target_process_links` (idempotente, `IF NOT EXISTS`): `matched_via TEXT`, `matched_value TEXT`, `first_linked_at TIMESTAMPTZ DEFAULT now()`, `unlinked_at TIMESTAMPTZ`, UNIQUE `(target_id, process_id)`
- Em `process_updates`: coluna `is_initial_discovery BOOLEAN DEFAULT false`, `target_id UUID`
- Em `ingestion_jobs`: coluna `kind TEXT DEFAULT 'sync'` (valores: `'sync' | 'lawyer_discovery'`), índice parcial para `kind='lawyer_discovery'`
- Habilita Realtime em `discovery_runs` via `ALTER PUBLICATION supabase_realtime ADD TABLE public.discovery_runs;`
- Função `consume_rate_limit` já existe — reutiliza para bucket `datajud:tjrj`

## Bloco 2 — Tipos

`src/types/targets.ts` — `TargetType` (adiciona `'lawyer'`), `DiscoveryStatus`, `DiscoveryTrigger`, `LawyerTarget`, `DiscoveryRun`, `CreateLawyerTargetPayload`. Reexportar a partir do tipo gerado quando possível.

## Bloco 3 — Adapter de busca por OAB

`src/ingestion/adapters/datajud/lawyer-search.ts`

- `searchByOab({ uf, numero, searchAfter? })` no índice `api_publica_tjrj`
- Estratégia 2-tentativas: query **nested** (`partes.representantes.numeroOAB` + `ufOAB`) → fallback **flat** (`representantes.*`); cacheia variante vencedora em memória por run
- Paginação `search_after` + `sort: ["@timestamp", "_id"]`, `size: 100`
- Retry: 429 respeita `Retry-After` (máx 3); 5xx backoff 1s/2.5s/6s; 4xx aborta a OAB
- Hard cap 50.000 hits por run
- Logs estruturados com OAB mascarada (`RJ ***678`)

## Bloco 4 — Server functions (`src/lib/lawyer.functions.ts`)

Todas com `requireSupabaseAuth` + checagem de ownership:

- **`createLawyerTarget`** — valida payload (Zod), normaliza/dedupe OABs (`/^[A-Z]{2}\d{3,7}$/`), enforce limite 3 lawyers ativos por user, rejeita OAB já monitorada (409). Insere target com `discovery_status='pending'`, cria `discovery_runs` (status `running`, `triggered_by='initial'`), enfileira 1 job `ingestion_jobs.kind='lawyer_discovery'` com payload `{ targetId, runId, oabs, triggeredBy }`. Retorna `{ target, runId, discovery_url }`.
- **`getDiscoveryStatus`** — lê última `discovery_runs` por `target_id`, calcula `progress` (rate-based) se `running`.
- **`triggerRediscovery`** — checa rate limit 6h e `running` (409); enfileira novo job.
- **`runLawyerDiscoveryJob({ jobId })`** — handler do worker: para cada OAB chama `searchByOab`, faz upsert em `processes`, em `target_process_links` (`matched_via='oab'`, `matched_value=<oab>`), insere `process_updates` com `is_initial_discovery: triggeredBy==='initial'`. A cada 100 hits / 5s atualiza `discovery_runs.total_found`, `by_oab`, `by_tribunal`. No fim, soft-unlink (`unlinked_at`) para refresh periódico de processos não revistos. Marca status final.

## Bloco 5 — Worker integrado ao tick existente

Em `src/lib/ingestion.functions.ts`, em `processDataJudJobs`, despachar por `kind`:
- `kind='sync'` → fluxo atual
- `kind='lawyer_discovery'` → chama `runLawyerDiscoveryJob`

Sem alterar o cron tick existente: ele já roda a cada 1 min e drena a fila.

`src/routes/api/public/discovery/refresh.ts` — POST com auth `apikey`; chama `enqueueLawyerRefreshJobs` (server fn) que enfileira 1 job `lawyer_discovery` com `triggered_by='periodic_refresh'` por target ativo, espaçando `scheduled_for` em +30s entre eles.

## Bloco 6 — pg_cron

```sql
SELECT cron.schedule(
  'lawyer-targets-refresh',
  '0 6 * * *',
  $$ SELECT net.http_post(
    url := '<published-url>/api/public/discovery/refresh',
    headers := jsonb_build_object('Content-Type','application/json','apikey','<SUPABASE_PUBLISHABLE_KEY>')
  ); $$
);
```

(URL e key resolvidas no momento do deploy a partir das settings já existentes.)

## Bloco 7 — UI

- `src/components/forms/OABInput.tsx` — input com tags, normalize/validate/format (`UF000000`), Enter/Tab/vírgula confirmam, Backspace remove, dedup, `maxItems`, erro inline. Usa Badge/Input do shadcn.
- `src/hooks/useDiscoveryStatus.ts` — fetch inicial via `useServerFn(getDiscoveryStatus)`, subscribe `postgres_changes` em `discovery_runs filter target_id=eq.X`, fallback polling 3s se canal não conecta em 3s; cleanup no unmount.
- `src/components/targets/LawyerTargetForm.tsx` — campos nome + OABInput + include_inactive + notas + alerta de busca em 2º plano; trata erros 409/422 com mensagens específicas; em sucesso navega para `/alvos/$targetId/descoberta`.
- `src/pages/DiscoveryProgress.tsx` — header com nome + chips de OAB, card de progresso (running/completed/partial/failed com seus CTAs), detalhamento por OAB com `inferOabStatus`, helper `formatElapsed`.

## Bloco 8 — Integração no fluxo existente

- **Modal de criação (`src/pages/Alvos.tsx` → `ModalitiesPicker`)**: adicionar item `lawyer` como **primeiro**, badge "Mais usado", emoji ⚖️; renderizar `LawyerTargetForm` quando selecionado. Manter os 3 cards atuais sem alterar comportamento.
- **Listagem `/alvos`**: estender `typeMeta` (em `useTargets`) com `lawyer` (cor indigo, ícone Gavel). Em `targetIdentifier`, render para `lawyer` mostra nome + chips de OAB (até 2 + `+N`). Coluna de status mostra spinner + link para descoberta quando `running`, ícone amber para `partial`, botão "Tentar novamente" para `failed`. Menu kebab ganha "Atualizar busca agora" com tooltip de janela 6h.
- **Feed**: chip de origem `lawyer` em indigo "Você é o patrono · OAB UF 000.000" usando `link.matched_via` e `matched_value`.

## Bloco 9 — Rota e Realtime

- `src/routes/_authenticated/alvos.$targetId.descoberta.tsx` (rota nova)
- Realtime: a migration já adiciona `discovery_runs` à publication

---

## Detalhes técnicos relevantes

- **Sem `EdgeRuntime.waitUntil`** — usamos a fila persistente (`ingestion_jobs`) que já é drenada pelo cron tick. Latência de início ≤ 60s. Resposta da criação volta imediatamente (não bloqueia).
- **RLS**: `discovery_runs` SELECT só por `auth.uid()=user_id`; writes pelo service role no servidor.
- **LGPD**: OAB sempre mascarada em logs (`UF + 3 últimos dígitos`); `lawyer_name` é dado público (registro OAB), sem criptografia.
- **Idempotência**: ALTER em `target_process_links` com `IF NOT EXISTS`/bloco `EXCEPTION`. Upsert de processos por `(process_number, tribunal_alias)`. Link único por `(target_id, process_id)`.
- **Detecção da query DataJud**: cache da variante (nested|flat) em memória do worker por `runId`.
- **Refresh diferenciado**: `triggered_by='periodic_refresh'` ⇒ `is_initial_discovery=false` em todos os updates ⇒ pipeline downstream notifica normalmente apenas movimentos novos.

## Checklist pós-implementação

- [ ] Migration roda limpa (`supabase db push`)
- [ ] Realtime ativo em `discovery_runs` (verificar Replication no painel)
- [ ] Criar target lawyer com 1 OAB conhecida → ver `runId` retornar e progresso atualizar em ≤ 90s
- [ ] Limite 3 lawyers e duplicata de OAB retornam 422/409
- [ ] Trigger manual antes de 6h retorna 429
- [ ] Cron diário aparece em `SELECT * FROM cron.job`

## Riscos e notas

- A primeira chamada por OAB em uma run pode custar até 2 round-trips (probe nested→flat); mitigado pelo cache em memória.
- Hard cap 50.000 evita estouro de fila; OABs muito antigas em RJ raramente passam disso.
- Substabelecimento sem reserva é detectado por ausência no resultado e marcado com `unlinked_at`, sem deletar histórico.
