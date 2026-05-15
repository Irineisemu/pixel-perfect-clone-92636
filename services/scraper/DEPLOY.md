# Deploy do Worker de Scraping

O worker é um processo Node.js + Playwright que roda **fora** do Cloudflare Workers
(que não suporta Chromium). Ele consome jobs da tabela `ingestion_jobs` no Postgres
do Lovable Cloud usando `FOR UPDATE SKIP LOCKED`, então **é seguro rodar várias
réplicas em paralelo**.

---

## 1. Variáveis de ambiente obrigatórias

| Variável | Obrigatória | Descrição |
|---|---|---|
| `SUPABASE_URL` | ✅ | URL do projeto (https://csmpefmtdmdmaopnukmx.supabase.co) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service role key (bypassa RLS) |
| `CREDENTIALS_ENCRYPTION_KEY` | ✅ | Mesma chave usada no app (descriptografa senhas OAB) |
| `WORKER_ID` | recomendado | Ex: `scraper-fly-1` (aparece nos logs) |
| `INGESTION_CONCURRENCY_SCRAPING` | opcional | default 2 |
| `SCRAPING_BROWSER_POOL_SIZE` | opcional | default 3 |
| `SCRAPING_DEFAULT_THROTTLE_MS` | opcional | default 1000 |
| `TICK_INTERVAL_MS` | opcional | default 5000 |
| `HEALTH_PORT` | opcional | default 8080 |
| `RAW_PAYLOAD_LOCAL_PATH` | opcional | default `/var/lib/jusradar/raw` |

---

## 2. Health check

O worker expõe `GET /healthz` na porta `HEALTH_PORT` (default 8080):

```json
{ "ok": true, "worker": "scraper-1", "lastTickAgoMs": 1240, "lastSuccessAgoMs": 18230 }
```

Retorna **503** se o tick não rodou nos últimos 6 ciclos — use isso como
liveness probe para reiniciar pods travados.

---

## 3. Deploy no Railway

```bash
cd services/scraper
railway login
railway init                       # cria projeto novo
railway up                         # build + deploy
```

No dashboard do Railway:
1. **Variables** → cole todas as variáveis da seção 1.
2. **Settings → Health Check** → path `/healthz`, port `8080`.
3. **Settings → Restart Policy** → `On Failure`.
4. Para escalar: `Settings → Replicas → 2+` (sem coordenação extra; a fila usa SKIP LOCKED).

> O Railway cobra por uso. Um worker single-replica + 1 browser idle gira em
> ~$5–10/mês.

---

## 4. Deploy no Fly.io

```bash
cd services/scraper
fly auth login
fly launch --no-deploy --copy-config       # usa o fly.toml deste repo
fly volumes create raw_payloads --size 1   # 1GB para HTML bruto
fly secrets set \
  SUPABASE_URL=... \
  SUPABASE_SERVICE_ROLE_KEY=... \
  CREDENTIALS_ENCRYPTION_KEY=...
fly deploy
fly logs                                   # acompanha
```

Para 2 réplicas:
```bash
fly scale count 2 --region gru
```

Cada máquina tem seu próprio volume — os HTMLs brutos não são compartilhados,
mas isso não afeta a operação (são apenas para auditoria/debug).

---

## 5. Build local + smoke test

```bash
cd services/scraper
docker build -t jusradar-scraper .
docker run --rm \
  -e SUPABASE_URL=... \
  -e SUPABASE_SERVICE_ROLE_KEY=... \
  -e CREDENTIALS_ENCRYPTION_KEY=... \
  -p 8080:8080 \
  jusradar-scraper
curl http://localhost:8080/healthz
```

---

## 6. Operação

### Logs
JSON estruturado por linha:
```json
{"ts":"2026-05-15T03:51:02.111Z","level":"info","worker":"scraper-1","event":"scrape_ok","jobId":"...","tribunal":"tjrj","durationMs":4321}
```
Eventos importantes:
- `worker_started`, `health_server_listening`
- `scrape_ok`, `scrape_failed` (com `kind`)
- `credential_check_ok`, `credential_check_failed`
- `pick_failed`, `tick_error`, `fatal`

### Painel no app
- `/configuracoes/jobs` → usuário vê próprios jobs (status, último erro, tentativas).
- `/admin/ingestion` → admin vê todos.

### Reprocessar dead-letters
No painel admin, ou via SQL:
```sql
UPDATE ingestion_jobs
SET status = 'needs_scraping', attempts = 0, last_error = NULL
WHERE status = 'dead_letter' AND tribunal = 'tjrj';
```

### Múltiplas réplicas
Pode escalar livremente. `pick_ingestion_jobs` usa `FOR UPDATE SKIP LOCKED`, e o
mesmo job nunca é pego por dois workers.

### Quando atualizar selectors
Erro `kind=parse_failed` em massa de um tribunal = HTML mudou. Editar
`src/adapters/<tribunal>/selectors.json` e redeployar.
