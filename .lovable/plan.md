
# Plano — Módulo de Captação JusRadar (`/src/ingestion`)

## Decisões confirmadas
- **DataJud:** chave real, roda dentro do Lovable (Cloudflare Worker, fetch puro).
- **Scraping:** apenas TJSP (e-SAJ) no MVP, em worker Node.js externo (Playwright não roda no Worker edge).
- **Cold storage:** filesystem local **no worker externo**. No lado Lovable (sem FS), o payload bruto do DataJud vai para uma tabela `raw_payloads` (JSONB) — mesma garantia de reprocesso, sem custo de S3.
- **Fila:** sem Redis/BullMQ disponíveis no Lovable. Usamos uma **tabela `ingestion_jobs`** no Postgres com `SELECT … FOR UPDATE SKIP LOCKED` como fila durável, polleada pelo worker externo e pelo cron interno.

## Arquitetura

```text
┌──────────────── Lovable (TanStack server fns) ────────────────┐
│  cron pg_cron  →  enqueue ProcessSyncJob                       │
│  DataJudAdapter (server fn)  ────► SourceRouter ──► canonical │
│  CircuitBreaker (Postgres)                                    │
│  raw_payloads (JSONB)                                         │
│  /api/public/ingestion/*  (admin: health, replay, dlq, reset) │
└────────────────────────────┬───────────────────────────────────┘
                             │  ingestion_jobs (FOR UPDATE SKIP LOCKED)
                             ▼
┌──────────── Worker externo (Node + Playwright, docker) ────────┐
│  TJSPAdapter (e-SAJ)  →  SourceRouter (mesma interface)        │
│  BrowserPool, robots.txt, throttling, fixtures                 │
│  RawPayloadStore local (/var/lib/jusradar/raw/...)             │
│  emite ProcessUpdated  →  insert em movements + notify pgcron  │
└────────────────────────────────────────────────────────────────┘
```

Saída única: evento `ProcessUpdated` (linha em `process_updates` + `pg_notify`) consumido pelo pipeline downstream existente.

## Entregáveis

### 1. Schema + fila (migration)
- `ingestion_jobs(id, process_number, tribunal, target_ids[], priority, status, attempts, locked_by, locked_until, last_error, scheduled_for, created_at)`
- `raw_payloads(id, source, process_number, tribunal, payload jsonb, fetched_at, latency_ms, correlation_id)`
- `circuit_breakers(adapter, state, failure_count, opened_at, half_open_probe_at)`
- `process_updates(id, process_id, canonical jsonb, movements_diff jsonb, source, created_at)` + trigger `pg_notify('process_updated', id)`
- `tribunals` já existe — só popular aliases DataJud.
- Índices: `(status, scheduled_for)` em ingestion_jobs; `(process_number, fetched_at desc)` em raw_payloads.

### 2. Núcleo compartilhado — `src/ingestion/core/`
- `types.ts` — `CanonicalProcess`, `CanonicalMovement`, `CanonicalParty` com **zod schemas** (validação obrigatória na saída do mapper).
- `ProcessSourceAdapter` interface: `kind`, `supports(tribunal)`, `fetchProcess(opts)`, `searchProcesses(criteria)`, `toCanonical(raw)`.
- `AdapterError` discriminated union: `not_found | rate_limited | blocked | auth_failed | source_unavailable | parse_failed | timeout`.
- `movementsHash(movements)` — sort por `(occurredAt, cnjMovementId)`, sha256 do JSON canônico.
- `detectPublicEntity(party)` — regex sobre nome + flag `is_state`.

### 3. DataJudAdapter (Lovable, server fn) — `src/ingestion/adapters/datajud/`
- `client.ts`: fetch nativo, header `Authorization: APIKey ${process.env.DATAJUD_API_KEY}`.
- `aliases.ts`: mapa completo (api_publica_tjsp, _trf3, _tjrj, _trf1…_trf6, _tst, _stj…).
- `query-builder.ts`: número exato e bool query (classes/polo/keywords) com `search_after`.
- `rate-limit.ts`: token bucket **no Postgres** (tabela `rate_limit_buckets` com UPDATE atômico) — substitui Redis.
- `cache.ts`: tabela `datajud_cache(key, payload, expires_at)` com TTL 25 min; bypass via `forceFresh`.
- Retry: 1s/2.5s/6s + jitter; honra `Retry-After`; aborta em 4xx≠429.
- `mapper.ts`: DataJud → `CanonicalProcess`, normaliza datas inconsistentes, calcula hash, marca `isPublicEntity`.
- Modo `MOCK_DATAJUD=true` lê fixtures de `src/ingestion/adapters/datajud/__fixtures__/`.

### 4. SourceRouter + CircuitBreaker — `src/ingestion/core/router.ts`
- Estratégia: DataJud → fallback TJSP scraping para tribunais suportados.
- Tratamento por `AdapterError.kind` exatamente como descrito no enunciado.
- CircuitBreaker persistido em `circuit_breakers` (closed/open/half-open). Threshold 5 falhas / 5 min, abre 10 min, half-open 1 sonda.
- Implementação reutilizável tanto no Lovable quanto no worker externo (export ESM puro, sem deps de Node).

### 5. IngestionWorker (Lovable side) — server fn + cron
- `enqueueSyncJobs` (server fn) — varre `monitoring_targets` ativos (modo `targeted` 30 min e `discovery` 6 h) e insere em `ingestion_jobs`.
- `processDataJudJobs` (server fn `/api/public/ingestion/tick`) — pega N jobs com SKIP LOCKED, roda DataJudAdapter via SourceRouter, grava `raw_payloads`, compara hash com `processes.last_known_movements_hash`, insere `process_updates` quando muda, atualiza `processes`.
- `pg_cron` chama `/api/public/ingestion/tick` a cada 1 min e `enqueueSyncJobs` nos intervalos de 30 min / 6 h. Auth via `apikey` (anon key).
- Jobs cujo `tribunal` exige scraping são marcados `status='needs_scraping'` para o worker externo puxar.

### 6. Worker externo TJSP — `services/scraper/` (entrega como projeto separado em `/services/scraper/`)
- Stack: Node 20, Playwright, `pg`, zod. Reutiliza `core/` via copy ou symlink.
- `BrowserPool` (size 3, contextos por domínio, cookies em arquivo local), throttling 1 req/s, UA `JusRadar/1.0 (+contato)`, robots.txt cache 24 h.
- Detecção de bloqueio por título da página → `AdapterError.blocked`.
- `TJSPAdapter`: fluxo `cpopg/open.do`, parser usando `tjspSelectors.json` versionado (sem hardcode), paginação de andamentos.
- `RawPayloadStore`: `/var/lib/jusradar/raw/{YYYY}/{MM}/{DD}/{processNumber}-{ts}.json`.
- Loop: SKIP LOCKED em `ingestion_jobs WHERE status='needs_scraping'`, executa, mesma lógica de `process_updates` + hash.
- Concorrência: `INGESTION_CONCURRENCY_SCRAPING=2`.
- `docker-compose.yml` com Playwright base image + variáveis de conexão Postgres (Supabase pooler).

### 7. Observabilidade
- **Logs estruturados JSON** (campos exigidos no enunciado) — helper `logger.ts` compartilhado.
- **Métricas Prometheus** expostas em `/api/public/ingestion/metrics` (Lovable: agrega contadores de tabela `ingestion_metrics`; worker expõe `:9090/metrics` próprio).
- Contadores: fetch_total, duration, breaker_state, cache_hits, queue_size, dlq_size, movements_detected.
- Endpoints admin (`/_authenticated/admin/ingestion`):
  - GET health, POST reset-breaker, POST replay, GET dead-letter.
  - Protegidos por `user_roles` (criar enum `app_role` + tabela `user_roles` + função `has_role` SECURITY DEFINER — ainda não existe no projeto).

### 8. Front (mínimo)
- Página `/_authenticated/admin/ingestion` (apenas `admin`): tabela de adapters, estado de breaker, botões reset/replay, lista DLQ. Reusa shadcn já presente.
- KPIs do dashboard atual passam a refletir `ingestion_jobs` + `process_updates` reais (já está plugado em `useTargets`/movements).

### 9. Secrets / env
- Adicionar via tool: `DATAJUD_API_KEY`, `INGESTION_TICK_SECRET` (opcional, pode-se usar anon key).
- No worker externo (`.env.example`): `DATABASE_URL`, `DATAJUD_API_KEY` (opcional, fallback do server), `SCRAPING_*`, `RAW_PAYLOAD_LOCAL_PATH`, `INGESTION_CONCURRENCY_SCRAPING`, `CIRCUIT_BREAKER_*`.

### 10. Riscos operacionais
- DataJud indisponível → fallback TJSP só cobre processos do TJSP; demais ficam atrasados. Mitigação: alarme em `breaker_state=open`.
- TJSP muda DOM → seletores em JSON versionado, alerta em `parse_failed` > N/h.
- Captcha/Cloudflare aparece → não burlar; pausar adapter, notificar admin.
- Custo Playwright em escala → throttle 1 req/s + janela 00–06h para varreduras.
- Cold storage local cresce → cron de limpeza > 90 dias + compressão gzip.
- Falsos positivos de bloqueio (página de manutenção) → diferenciar por status HTTP + título.
- Drift entre DataJud e tribunal → `last_source_used` registrado para auditoria.

## Plano de adição de novo tribunal (skeleton para README)
1. `src/ingestion/adapters/<tj>/` (ou `services/scraper/adapters/<tj>/` se scraping).
2. Implementar `ProcessSourceAdapter` + `mapper.ts` + `<tj>Selectors.json` (se scraping).
3. Adicionar `__fixtures__/process-ok.html|.json` e `process-blocked.html`.
4. Registrar no `SourceRouter` (`adapters: [datajud, tjsp, novo]`).
5. Inserir alias em `tribunals` (migration) e em `aliases.ts` se DataJud.
6. Testes unitários: mapper produz canonical válido (zod), parser aguenta variantes do HTML, breaker abre após 5 falhas.
7. Smoke test contra fixture; depois 1 processo real em homolog.

## Ordem de implementação
1. Migration (tabelas + breaker + fila + raw_payloads + user_roles).
2. Core (types/zod, interface, errors, hash, router, breaker).
3. DataJudAdapter + cache + rate-limit + mock.
4. Server fns + endpoints `/api/public/ingestion/*` + pg_cron.
5. Página admin + roles.
6. `services/scraper/` (TJSP) com docker-compose.
7. Observabilidade (logs + métricas) e DLQ.

## O que **não** está nesta entrega
Filtragem por classe/keyword, classificação de urgência (já é responsabilidade de quem consome `process_updates`), envio de notificações.

Confirme para eu começar pela **migration + core + DataJudAdapter** (passos 1–4), e em seguida entrego o `services/scraper/` separadamente.
