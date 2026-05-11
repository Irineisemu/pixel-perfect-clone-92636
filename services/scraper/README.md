# JusRadar Scraper Worker

Worker externo (Node.js + Playwright) que consome jobs `needs_scraping` da fila do Lovable Cloud e raspa o e-SAJ (TJSP) como fallback do DataJud.

## Stack
- **Node 20**, TypeScript, ESM
- **Playwright** (chromium headless, pool reusável)
- **@supabase/supabase-js** com service role (pula RLS, usa `pick_ingestion_jobs`)

## Setup

```bash
cd services/scraper
cp .env.example .env   # preencher SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
npm install
npx playwright install chromium
npm run dev
```

## Variáveis principais
| var | default | descrição |
|---|---|---|
| `SCRAPING_BROWSER_POOL_SIZE` | 3 | browsers reusáveis |
| `SCRAPING_DEFAULT_THROTTLE_MS` | 1000 | atraso mínimo entre hits no mesmo domínio |
| `INGESTION_CONCURRENCY_SCRAPING` | 2 | jobs simultâneos |
| `RAW_PAYLOAD_LOCAL_PATH` | `/var/lib/jusradar/raw` | onde o HTML/JSON bruto fica salvo |

## Operação
- O loop chama `rpc.pick_ingestion_jobs(['needs_scraping'], …)` com `FOR UPDATE SKIP LOCKED`.
- Sucesso → grava `process_updates` (se hash mudou) e atualiza `processes.last_*`.
- Falha → marca `needs_scraping` com backoff exponencial; após `max_attempts` vai para `dead_letter`.
- `robots.txt` é checado (cache 24h). Páginas de bloqueio (CAPTCHA / Cloudflare) abortam o job com `kind=blocked`.
- Selectors versionados em `src/adapters/tjsp/selectors.json` — alterar lá quando o e-SAJ mudar HTML.

## Cron no Lovable Cloud
Já configurado via `pg_cron`:
- `* * * * *` — processa fila DataJud (chama `/api/public/ingestion/tick`)
- `*/30 * * * *` — enfileira radares alvo
- `0 */6 * * *` — descoberta de novos processos

O painel admin fica em `/admin/ingestion` (requer role `admin` em `user_roles`).
