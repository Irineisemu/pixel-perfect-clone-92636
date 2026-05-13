# MVP: Monitoramento de processos por número CNJ via DataJud

## Contexto

O DataJud do TJRJ não retorna campos de partes/representantes confiavelmente, então a busca por OAB via API não funciona. Mas a busca por número CNJ funciona perfeitamente e retorna movimentações completas. Esta entrega entrega o MVP funcional usando esse fluxo, e prepara o terreno para a Fase 2 (scraping e-SAJ) reaproveitar 100% do pipeline.

## Arquitetura

```text
Usuário digita CNJ ──▶ createProcessTargets (server fn)
                            │
                            ├─▶ INSERT monitoring_targets (source_type=manual_number)
                            └─▶ fetch sync-process-by-number (fire-and-forget)
                                          │
                                          ▼
                            Edge Function sync-process-by-number
                                          │
                       ┌──────────────────┼──────────────────┐
                       ▼                  ▼                  ▼
                  DataJud query    upsert processes   upsert process_movements
                                                       (UNIQUE process+code+data)
                                                       (is_new = !isInitialSync)

pg_cron (*/30 min) ──▶ sync-all-processes ──▶ chama sync-process-by-number
                                              com isInitialSync=false (notifica)

Dashboard ──▶ getDashboard server fn ──▶ lê processes + process_movements (is_new)
```

`source_type` em `monitoring_targets` distingue origem:
- `manual_number` (MVP)
- `oab_scraping` (Fase 2 — scraper e-SAJ chama a MESMA `sync-process-by-number`)
- `oab_datajud` / `radar` (futuros)

## Blocos de implementação (ordem)

### Bloco 1 — Migration de schema
- `monitoring_targets.source_type TEXT DEFAULT 'manual_number'` (idempotente)
- `processes`: adicionar `class_name`, `subject_names`, `instance`, `sync_status` (CHECK pending|synced|failed|not_found), `last_movement_at`, `total_movements`, `new_movements_count`
- Nova tabela `process_movements`:
  - colunas: process_id (FK CASCADE), movement_code, movement_name, occurred_at, organ_code, organ_name, complements jsonb, raw_data jsonb, is_new bool, notified_at, created_at
  - `UNIQUE (process_id, movement_code, occurred_at)` para deduplicar
  - índices: (process_id, occurred_at DESC) e parcial (is_new=true)
  - RLS: SELECT para o dono via `target_process_links`+`monitoring_targets`; ALL para service_role

### Bloco 2 — Edge Function `sync-process-by-number`
Em `supabase/functions/sync-process-by-number/index.ts`:
- Input: `{ processNumber, targetId?, isInitialSync? }`
- Normaliza para apenas dígitos; valida 15–25 chars
- POST `https://api-publica.datajud.cnj.jus.br/api_publica_tjrj/_search` com `{size:1, query:{match:{numeroProcesso}}}` e `Authorization: APIKey ${DATAJUD_API_KEY}`
- 404 amigável se não encontrar (marca `sync_status=not_found`)
- Upsert `processes` (onConflict process_number) com hash dos movimentos
- Se `targetId`: upsert `target_process_links`
- Para cada movimento: upsert com `ignoreDuplicates:true`, `is_new = !isInitialSync`
- Atualiza contadores e `last_movement_at` no processo

### Bloco 3 — Edge Function `sync-all-processes`
Em `supabase/functions/sync-all-processes/index.ts`:
- Lista todos `monitoring_targets` ativos com `process_number`
- Chama `sync-process-by-number` com `isInitialSync=false` (rate limit 1 req/s)
- Auth via `apikey` header (anon/publishable key) — padrão Lovable Cloud, sem CRON_SECRET custom

### Bloco 4 — Server function `createProcessTargets`
Em `src/lib/process.functions.ts` (NÃO em `src/server/...`, pois bloqueado pelo client bundle):
- Zod schema (1–20 números)
- Para cada número: normaliza, verifica duplicata por user, INSERT em `monitoring_targets` com `source_type=manual_number`, dispara `sync-process-by-number` via fetch fire-and-forget com `isInitialSync=true`
- Usa `requireSupabaseAuth` middleware (não service client direto, exceto para o INSERT que precisa burlar; ou usar context.supabase com RLS já que policies permitem auth.uid())

### Bloco 5 — Atualizar `getDashboard` e UI do painel
- Em `src/lib/dashboard.functions.ts`: estender query atual para trazer `class_name`, `sync_status`, `last_movement_at`, `total_movements`, `new_movements_count` + lista de `process_movements` com `is_new=true`
- Atualizar `src/components/DashboardProcesses.tsx`:
  - KPIs: total processos + total movimentações novas
  - Seção "Movimentações novas" (até 20)
  - Lista de processos com badge vermelho quando `new_movements_count > 0`, status sincronizando/em dia/não encontrado
  - Empty state amigável apontando para Alvos → Novo

### Bloco 6 — Componente `ProcessNumberForm`
Em `src/components/ProcessNumberForm.tsx`:
- Input com chips (Enter/Tab/vírgula confirma; Backspace remove último)
- Validação 15–25 dígitos, máx 20
- Apelido opcional
- Confirma input pendente no submit
- Chama `createProcessTargets` via `useServerFn`
- Toast de sucesso + navega para `/`

### Bloco 7 — Integrar no fluxo de criação de alvos
- No modal/página de Alvos, no card `process` atualizar copy para "Digite o número CNJ e o JusRadar monitora movimentações automaticamente"
- No Passo 2 quando `selectedType === 'process'`, renderizar `ProcessNumberForm`

### Bloco 8 — pg_cron (a cada 30 min)
SQL no painel do banco agendando `net.http_post` para `/functions/v1/sync-all-processes` com header `apikey: <SUPABASE_PUBLISHABLE_KEY>`.

## Detalhes técnicos importantes

- **Edge Functions vs server fn**: a especificação do usuário pede Edge Functions explicitamente para `sync-process-by-number` (chamada por cron e fire-and-forget pós-cadastro). Mantemos como Edge Functions — é o caminho correto para esses dois casos.
- **`source_type`**: já garante que Fase 2 (scraper e-SAJ) chame a mesma `sync-process-by-number` sem nenhum refactor.
- **`isInitialSync`**: `true` no cadastro (não polui notificações com histórico), `false` no cron (gera badge "nova").
- **Dedup de movimentações**: garantida pela UNIQUE constraint + `ignoreDuplicates`.
- **Auth do cron**: usar `apikey` header com a publishable key (padrão Lovable Cloud), não criar `CRON_SECRET` novo.
- **Server function file path**: TanStack Start bloqueia `src/server/`. Usar `src/lib/process.functions.ts`.

## Arquivos criados/alterados

Criados:
- `supabase/migrations/<ts>_add_source_type_and_movements.sql`
- `supabase/functions/sync-process-by-number/index.ts`
- `supabase/functions/sync-all-processes/index.ts`
- `src/lib/process.functions.ts`
- `src/components/ProcessNumberForm.tsx`

Alterados:
- `src/lib/dashboard.functions.ts` (estender query)
- `src/components/DashboardProcesses.tsx` (badges + seção movimentos novos)
- Página/modal de Alvos (integrar `ProcessNumberForm` no tipo `process`)

Pós-aprovação: após a migration rodar, agendar o cron via SQL adicional.
