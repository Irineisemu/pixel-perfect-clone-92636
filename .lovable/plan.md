
# Plano — Backend JusRadar (arquitetura híbrida)

## 0. Decisão de stack

**Node.js 20 + TypeScript** para o serviço externo (DataJud, scraping, BullMQ, Playwright, notificações). Justificativa: o front já é TS/React, ecossistema BullMQ + Playwright + Nodemailer + Evolution é mais maduro em Node, e o time evita troca de linguagem entre front e back. **Supabase (Lovable Cloud)** para Postgres, Auth (e-mail/senha), Storage e API REST automática consumida pelo front. As duas pontas compartilham o mesmo banco Postgres — o serviço Node usa `pg` direto com a `DATABASE_URL` do Supabase; RLS protege o que o front lê via PostgREST.

## 1. Topologia

```text
[ Front Lovable (TanStack) ]
            │  HTTPS + JWT do Supabase Auth
            ▼
[ Lovable Cloud / Supabase ]
   ├─ Auth (e-mail/senha, JWT)
   ├─ Postgres 15 + RLS (fonte única da verdade)
   ├─ PostgREST (CRUD de targets, leitura de movements, status)
   └─ Edge Function "trigger-sync" (opcional, dispara job avulso)
            ▲ pg notify / REST
            │
[ Serviço /server  (Node 20 + TS, deploy Fly.io/Railway) ]
   ├─ API interna Fastify  → /internal/* (autenticada com SERVICE_ROLE)
   ├─ Workers BullMQ        → sync, notify, digest, scrape
   ├─ Scheduler node-cron   → sync 30min, status 5min, digests
   ├─ Adapters Tribunais    → DataJudAdapter (primário) + Scrapers
   ├─ NotificationDispatcher (SMTP + Evolution + Twilio fallback)
   └─ Redis (Upstash)       → cache DataJud, lock cron, BullMQ
```

Fronteira clara: **front nunca fala com /server**. Front fala só com Supabase. O /server fala com Supabase (escreve `processes`, `movements`, `notifications_log`) e com mundo externo (DataJud, SMTP, WhatsApp).

## 2. Árvore de diretórios

```text
.
├─ src/                      # front Lovable existente (TanStack)
│  ├─ integrations/supabase/ # gerado pelo Lovable Cloud
│  ├─ lib/api/               # NOVO: wrappers tipados em torno do supabase-js
│  └─ ...
└─ server/                   # NOVO — repo Node deployável separado
   ├─ src/
   │  ├─ config/env.ts                 # zod, fail-fast
   │  ├─ db/                           # pg pool, migrations Drizzle
   │  │  ├─ schema.ts
   │  │  └─ migrations/
   │  ├─ datajud/
   │  │  ├─ client.ts                  # fetchProcessFromDataJud
   │  │  ├─ cache.ts                   # Redis 25min TTL
   │  │  ├─ rate-limit.ts              # token bucket 60/min
   │  │  └─ types.ts
   │  ├─ adapters/
   │  │  ├─ TribunalAdapter.ts         # interface
   │  │  ├─ DataJudAdapter.ts
   │  │  └─ scrapers/                  # Playwright/cheerio por tribunal
   │  ├─ pipeline/
   │  │  ├─ classifyMovement.ts
   │  │  ├─ matchesPerson.ts           # Levenshtein ≥ 0.9 + normalização NFKD
   │  │  ├─ matchesRadar.ts
   │  │  ├─ extractKeywordMatch.ts     # regex word-boundary "professor"
   │  │  ├─ classWhitelist.ts          # 197, 154/155, 7+Estado
   │  │  └─ syncProcess.ts             # diff via SHA-256 hash
   │  ├─ notifications/
   │  │  ├─ NotificationDispatcher.ts
   │  │  ├─ channels/{email,whatsapp}.ts
   │  │  ├─ templates/                 # Handlebars × 4 urgências × 2 canais
   │  │  └─ digest.ts
   │  ├─ jobs/                         # BullMQ producers + workers
   │  │  ├─ queues.ts
   │  │  ├─ syncProcesses.worker.ts
   │  │  ├─ notify.worker.ts
   │  │  └─ digest.worker.ts
   │  ├─ scheduler/                    # node-cron + Redis lock
   │  ├─ api/                          # Fastify /internal/*
   │  │  ├─ routes/{targets-test,sync-now,me-export,me-purge}.ts
   │  │  └─ auth.ts                    # valida JWT Supabase
   │  ├─ lib/{logger.ts,metrics.ts,crypto.ts}
   │  └─ index.ts                      # bootstrap api+workers
   ├─ tests/                           # vitest (unit nas funções de regra)
   ├─ Dockerfile
   ├─ docker-compose.yml               # postgres+redis+app+worker para dev local
   ├─ .env.example
   └─ README.md
```

## 3. Passo 1 — Modelagem (resumo, DDL completo no entregável)

Tabelas no schema `public` do Supabase (agente vai gerar via migration tool):

- `users` → reaproveita `auth.users`; tabela `profiles(id, name, oab, phone_enc, email_enc, tz, deleted_at)` espelha.
- `tribunals(alias PK, name, sphere, last_synced_at, status)`.
- `monitoring_targets(id, user_id, type enum[person|process|radar], is_active, full_name, cpf_enc, oab, qualification, aliases text[], process_number, tribunal_alias, nickname, tribunal_aliases text[], class_codes int[], keywords text[], against_state_only bool, created_at)`.
- `processes(id, process_number UNIQUE, tribunal_alias, class_code, subject_codes int[], parties_json jsonb, last_known_movements_hash, last_synced_at)`.
- `parties(id, process_id, polo enum[ativo|passivo], name_normalized, cpf_hash, cnpj, qualification, is_state bool)`.
- `movements(id, process_id, cnj_movement_id, occurred_at, code, text, urgency enum, classification_reasons jsonb, match_excerpt, created_at)`.
- `target_process_links(target_id, process_id, matched_at, PK composto)`.
- `alert_configs(user_id PK, channels text[], frequency enum[instant|daily|weekly], digest_hour, digest_dow)`.
- `notifications_log(id, user_id, movement_id, channel, status enum[queued|sent|failed|dead_letter], attempts, sent_at, masked_recipient, UNIQUE(user_id,movement_id,channel))`.

Índices conforme briefing + `processes(tribunal_alias)`, `parties(name_normalized)`, `parties(cpf_hash)`, `movements(urgency, occurred_at DESC)`.

RLS: usuário só lê/escreve linhas onde `user_id = auth.uid()`. `processes`, `movements`, `parties`, `tribunals` legíveis por qualquer autenticado dono de target relacionado (policy via JOIN em `target_process_links`). Service role (worker) bypassa.

Criptografia: `pgcrypto` AES-GCM com chave em `vault.secrets`. Helpers `enc(text)` / `dec(bytea)` em SQL functions.

Diagrama Mermaid completo no entregável final.

## 4. Passo 2 — Camada DataJud

`server/src/datajud/client.ts` exporta:

```ts
fetchProcessFromDataJud(processNumber, tribunalAlias): Promise<DataJudProcess>
searchProcessesByCriteria(alias, query): AsyncIterable<DataJudProcess>  // search_after
```

- Header `Authorization: APIKey ${env.DATAJUD_API_KEY}`.
- Token bucket Redis 60 req/min/chave (`INCR` + `EXPIRE`).
- Cache `datajud:{alias}:{number}` TTL 1500s.
- Retry: backoff 1s/2s/4s + jitter ±250ms, 3 tentativas; 429 honra `Retry-After`; 5xx retry; 4xx (exceto 429) não retry.
- Timeout 15s por request, AbortController.
- Tipos derivados de schema Zod do payload ES.

## 5. Passo 3 — Pipeline

Fluxo do worker `syncProcesses`:

1. Cron 30min adquire lock Redis `lock:sync:{shard}` SETNX 25min.
2. Para cada `user` ativo → materializa `Set<processNumber>` somando: `targets.process` direto + busca DataJud para `person`/`radar`.
3. Para cada número → `fetchProcessFromDataJud` (cache).
4. `classWhitelist.includes(class_code)` ou descarta.
5. `matchesPerson(party, target)` para targets pessoa: normaliza NFKD, lower, colapsa espaço; `cpf_hash` exato OU Levenshtein normalizado ≥ 0.9.
6. `matchesRadar`: confere `against_state_only` (regex União/Estado/Município/Fazenda/INSS/Autarquia/Fundação + códigos IBGE 1xxx) + `extractKeywordMatch` (regex `\b(professor[ae]?s?|docentes?|magist[ée]rio)\b` em qualificação+assunto+ementa, retorna `match_excerpt`).
7. UPSERT `processes`/`parties`. Calcula novo hash SHA-256 dos `cnj_movement_id` ordenados.
8. Diff = movimentos com IDs ausentes em hash anterior → INSERT em `movements` com `classifyMovement()` retornando `{urgency, shouldNotify, reasons[]}`.
9. Se `shouldNotify`, enfileira `notify` job.
10. `last_known_movements_hash` e `last_synced_at` atualizados na MESMA transação.

`classifyMovement`: tabela de códigos CNJ → urgência base + heurísticas de texto (regex prazo `\b\d{1,3}\s*(dias?|horas?)\b`, "intima", "mandado", "liminar", "sentença"). Determinístico, testável.

## 6. Passo 4 — Notificações

`NotificationDispatcher.dispatch(notification)`:

1. INSERT `notifications_log` com `status=queued` + UNIQUE → `ON CONFLICT DO NOTHING`. Se 0 linhas, abort silencioso (idempotência por banco).
2. Lê `alert_configs.frequency`:
   - `instant` → enfileira `notify:send` (worker dedicado, latência <1 min).
   - `daily`/`weekly` → marca `digest_pending`; cron `digestBuilder` agrupa por usuário+TZ e envia 1 e-mail/WhatsApp consolidado.
3. Worker `notify:send`: renderiza template Handlebars (`templates/{channel}/{urgency}.hbs`), envia via canal, atualiza status.
4. Retry BullMQ: 3 tentativas, backoff exponencial 30s/2min/10min. Falha definitiva → `status=dead_letter` + métrica Prometheus `notifications_dead_letter_total` (alerta admin se >10/h).
5. Logs com `maskEmail` e `maskPhone` (`j***@dom.com`, `+55 11 ****-1234`).

Templates exemplo: e-mail HTML responsivo + WhatsApp texto puro (≤1024 chars). 8 arquivos.

## 7. Passo 5 — API e orquestração

**Front consome Supabase diretamente** para o CRUD de `targets`, leitura de `movements`/`tribunals`/`alert_configs`. Validação client-side com Zod + RLS no banco. Limite de 5 radares: trigger Postgres `BEFORE INSERT ON monitoring_targets` que conta `WHERE type='radar' AND is_active`.

**API interna Fastify do /server** (`/internal/*`, JWT Supabase obrigatório):

- `POST /internal/targets/test` — dry-run (não persiste): roda pipeline contra últimos 7 dias, retorna até 5 amostras.
- `POST /internal/sync-now` — força sync de 1 target (rate-limit por usuário).
- `GET /internal/me/export` — LGPD; retorna ZIP de JSONs.
- `DELETE /internal/me` — soft-delete `profiles.deleted_at`; cron `purgeUsers` apaga após 30 dias.
- `GET /internal/health` — pings DB, Redis, DataJud.

**Cron jobs** (node-cron + Redis lock):

| Job | Frequência | Lock |
|---|---|---|
| `syncProcesses` | `*/30 * * * *` | `lock:sync` 25min |
| `updateTribunalsStatus` | `*/5 * * * *` | `lock:tribunals` 4min |
| `digestBuilderDaily` | `0 * * * *` (filtra por TZ usuário) | `lock:digest:daily` |
| `digestBuilderWeekly` | `0 8 * * 1` | `lock:digest:weekly` |
| `cleanupDeadLetter` | `0 3 * * *` | `lock:dlq` |
| `purgeUsers` | `0 4 * * *` | `lock:purge` |

`.env.example` (server): `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `REDIS_URL`, `DATAJUD_API_KEY`, `JWT_AUDIENCE=authenticated`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, `SENTRY_DSN`, `LOG_LEVEL=info`, `PORT=3001`.

`.env` (front, gerado pelo Lovable Cloud): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.

## 8. Integração com o front existente

Trocar mocks de `src/data/mock.ts` e `src/lib/useTargets.ts` por wrappers em `src/lib/api/`:

- `useTargetsQuery()` → `supabase.from('monitoring_targets').select(...)` com React Query.
- `useMovementsQuery({filters})` → idem com paginação cursor.
- `useTribunalsStatus()`.
- `useAlertConfig()` + mutation.
- Adicionar páginas Lovable Auth (login/signup) usando `@/integrations/supabase/client`.
- `POST /targets/test` e `/me/export` chamam `${VITE_SERVER_API_URL}/internal/*` com JWT do Supabase no header.

## 9. Setup local e deploy

`server/docker-compose.yml`: serviços `postgres:15`, `redis:7`, `app` (Fastify), `worker` (workers BullMQ separados). Migrations via Drizzle Kit (`pnpm db:migrate`). Testes Vitest (`pnpm test`). Cobertura alvo 70% nas regras (`classifyMovement`, `matchesPerson`, `extractKeywordMatch`, `validateCNJNumber`, idempotência do dispatcher).

Deploy:
- Front: publish Lovable (já automático).
- Backend `/server`: imagem Docker → Fly.io (1 process api + 1 process worker) ou Railway. Redis: Upstash. Postgres: o próprio do Supabase via `DATABASE_URL` (pooler).

## 10. Riscos e próximos passos

- DataJud é instável; precisamos circuit breaker por alias e fallback para scraper quando `last_synced_at` > 2h.
- Rate-limit da API DataJud não é público → 60/min é chute conservador.
- Levenshtein 0.9 pode ainda gerar falsos positivos com nomes muito comuns ("João Silva"); pós-MVP: combinar com OAB/CPF parcial.
- Evolution API hoje não tem chave (confirmado) → MVP entrega WhatsApp desligado por flag, e-mail SMTP obrigatório.
- pg_trgm/tsvector para keyword search no banco quando a base crescer.
- Worker único = SPOF; horizontal scale exige BullMQ groups + lock por shard de usuário.
- LGPD: revisar com jurídico se CPF de pessoa monitorada precisa de base legal explícita.

---

Após aprovação, implemento na ordem: (1) habilita Lovable Cloud + migrations, (2) auth no front, (3) wrappers React Query trocando mocks, (4) scaffold `/server` com env+db+datajud client+testes, (5) pipeline+jobs, (6) notificações, (7) docker-compose+README.
