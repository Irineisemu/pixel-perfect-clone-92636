## Pre-flight (já validado)

- `DATAJUD_API_KEY` ✅ está nos Secrets (visível em `<secrets>`).
- `target_process_links` ✅ já tem `matched_via`, `matched_value`, `first_linked_at`, `unlinked_at` e `UNIQUE(target_id, process_id)` (constraint `target_process_links_unique`).
- RLS ✅ já existe em `processes` (`processes_via_links`) e `target_process_links` (`tpl_select`) com leitura via ownership do target. Nenhuma migration necessária.

## Observação importante (divergência do briefing)

O projeto **já tem** o pipeline de descoberta funcionando, e não via Edge Function Supabase, mas via:

- `createLawyerTarget` (server fn) → cria target + `discovery_run` + enfileira `ingestion_jobs`
- `triggerRediscovery` (server fn) → equivale ao "retry manual"
- Worker em `/api/public/ingestion/tick` que consome `ingestion_jobs` e roda `runLawyerDiscoveryJob`
- Adapter `src/ingestion/adapters/datajud/lawyer-search.ts` com fallback nested→flat (corrigido recentemente)

**Criar uma Edge Function paralela duplicaria infra e quebraria o que está funcionando**. Vou aproveitar o que existe e focar nos gaps reais: o painel `/` não mostra processos vinculados, e não há botão visível para o usuário disparar `triggerRediscovery`.

Se você quiser **mesmo** trocar o pipeline por uma Edge Function Deno (porque o worker via `tick` depende de cron externo), me diga e eu replano. Por padrão, sigo com o existente.

## Plano (escopo cirúrgico, só UI + uma server fn de leitura)

### 1. Server function `getDashboard` (nova)

Arquivo: `src/lib/dashboard.functions.ts`

- Protegida por `requireSupabaseAuth`, RLS da própria conexão do usuário.
- Retorna:
  - `stats`: `{ totalProcesses, totalLawyers }`
  - `lawyers`: lista de targets `lawyer` ativos com `discovery_status`, `last_discovery_at`, `oab_numbers`
  - `processes`: até 50 processos vinculados (join `target_process_links` → `processes`) com tribunal, classe, assuntos, OAB de match, target dono
  - `hasRunningDiscovery`: boolean (algum lawyer com status `pending`/`running`)

### 2. Refatorar `AppShell` rota `/` (`src/routes/_authenticated/index.tsx` + `src/components/AppShell.tsx`)

Hoje `AppShell` carrega `movements` mock-style e mostra Feed de movimentos. Para a entrega:

- No modo `route="inicio"`, substituir o bloco do `Feed` por um novo componente `<DashboardProcesses>` que consome `getDashboard` via `useServerFn`.
- Manter o resto (header, KPIs adaptados, sidebar de tribunais).
- KPIs alimentados por `stats` + contagens existentes.

### 3. Componente `DashboardProcesses` (novo)

Arquivo: `src/components/DashboardProcesses.tsx`

- Lista de cards de advogados com:
  - Nome, OABs formatadas (`RJ 183.970`)
  - Status visual: ⏳ pending / 🔄 running / ✓ completed / ⚠ partial / ✗ failed
  - Botão **"Buscar processos"** quando status ∈ {`null`, `pending`, `failed`, `partial`} (ou re-roda em `completed` se sem links). Chama `triggerRediscovery` (já existe).
- Lista de processos vinculados (cards: número, classe, assuntos, tribunal, OAB que matchou).
- Empty states diferenciados (sem advogados / sem processos / descoberta rodando).
- Auto-refresh (`setInterval` 5s) enquanto `hasRunningDiscovery=true`; para quando termina.
- Toast de erro/sucesso ao disparar retry.

### 4. Validação manual

- Logar, ir para `/`.
- Cadastrar um lawyer (já dispara descoberta automaticamente via `createLawyerTarget`).
- Ver card "🔄 Buscando processos" + página atualizando sozinha.
- Quando concluir, processos aparecem listados.
- Para targets antigos em `pending`/`failed`, clicar "Buscar processos" → status vira `running` → processos aparecem.

## Detalhes técnicos

- Usar `supabase` (browser client, RLS) dentro de `getDashboard`? Não — usar `requireSupabaseAuth` + `context.supabase` (cliente autenticado server-side com bearer do usuário, RLS aplica). Padrão já presente no projeto.
- Cron real do worker (`/api/public/ingestion/tick`): assumido ativo. Se não estiver, a descoberta fica parada em `pending` mesmo após dispatch — fora do escopo desta entrega, mas o botão de retry e o status visual deixam isso evidente.
- Sem mudanças em schema, RLS, edge functions ou no adapter DataJud.

## Arquivos tocados

- **novo**: `src/lib/dashboard.functions.ts`
- **novo**: `src/components/DashboardProcesses.tsx`
- **edit**: `src/components/AppShell.tsx` (substituir Feed por DashboardProcesses no modo `inicio`)
