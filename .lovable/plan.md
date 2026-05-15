## Escopo

Quatro entregas conectadas para colocar o scraper TJRJ em produção:

1. **Adapter TJRJ** (`services/scraper/src/adapters/tjrj/`)
2. **Credenciais OAB por usuário** (UI + criptografia + enfileiramento)
3. **Painel de logs/monitoramento de jobs** (UI)
4. **Dockerfile + deploy do worker** (Railway / Fly.io)

---

## 1. Adapter TJRJ

Mesmo padrão do TJSP: `index.ts` + `selectors.json` + erros tipados.

Alvo: **PJe TJRJ 2º grau** (`https://pje.tjrj.jus.br/2g/ConsultaPublica/listView.seam`) — tem consulta pública por número CNJ sem login. 1º grau exige login com OAB+senha (usado só quando o usuário cadastra credenciais).

Fluxo público (sem credencial):
```
goto listView.seam
preencher numeroProcesso (mascarado CNJ)
click pesquisar → resultados
click detalhes → página com partes + movimentações
parse tabelas
```

Fluxo autenticado (com OAB do usuário, 1º grau):
```
goto login PJe TJRJ
fill usuario/senha (das credenciais descriptografadas vindas no payload do job)
detectar página de erro de login → throw TJRJScrapeError("auth_failed")
seguir fluxo de consulta
```

Erros tipados: `blocked | not_found | parse_failed | timeout | source_unavailable | auth_failed | captcha_required`.

Selectors em JSON versionado. Detecção de Cloudflare/captcha aborta com `kind=blocked` ou `captcha_required` (sem tentar resolver).

Adicionar roteamento em `src/index.ts` baseado em `job.tribunal`:
```
tjrj → scrapeTJRJ
tjsp → scrapeTJSP
```

---

## 2. Credenciais OAB por usuário

### Banco
Nova tabela `tribunal_credentials`:
- `user_id`, `tribunal_alias` (tjrj, tjsp…), `oab_number`, `oab_uf`
- `password_enc bytea` — AES-GCM via `pgcrypto.pgp_sym_encrypt(password, current_setting('app.creds_key'))`
- RLS: usuário só lê/escreve as próprias linhas
- Senha **nunca** retorna ao cliente; campos sensíveis lidos só por função `get_credentials_for_scraper(user_id, tribunal)` `SECURITY DEFINER` chamada pelo worker (service role).

Chave de criptografia: secret `CREDENTIALS_ENCRYPTION_KEY` (peço via `add_secret`). O worker injeta `SET app.creds_key` por sessão antes de chamar a função.

### UI
Nova página `/configuracoes/credenciais` (e card em `Configuracoes.tsx`):
- Lista credenciais cadastradas (mostra OAB e tribunal, nunca senha)
- Form: tribunal (select), OAB, UF, senha (password input)
- Botão "Testar credencial" → enfileira job `kind=credential_check`
- Status última validação (ok/falhou + timestamp)

Server functions em `src/lib/credentials.functions.ts`:
- `listCredentials()`, `upsertCredential()`, `deleteCredential()`, `testCredential()`
- Todas com `requireSupabaseAuth`. `upsert` chama RPC `set_credential(tribunal, oab, uf, password)` que faz a criptografia server-side.

### Enfileiramento automático
Quando o adapter falha com `auth_required` (ou um processo de 1º grau não retorna sem login), o worker enfileira `needs_scraping` com `payload.requires_credentials = true` e `payload.user_id`. Se o usuário não tiver credencial cadastrada → marca `dead_letter` com `last_error_kind=missing_credentials` e cria notificação.

---

## 3. Painel de logs/monitoramento

Reaproveita `/admin/ingestion` (já existe) + nova aba **"Jobs"** acessível ao usuário comum em `/configuracoes/jobs`:

- Tabela paginada de `ingestion_jobs` filtrada por `user_id` (via target_ids → monitoring_targets)
- Colunas: tribunal, processo, status, tentativas, último erro, kind do erro, duração (locked_until - updated_at), agendado para
- Filtros: status, tribunal, kind do erro, intervalo de datas
- Detalhe do job (drawer): payload completo, histórico de erros, link para `raw_payloads` mais recente
- Auto-refresh a cada 10s (realtime opcional via `supabase.channel`)

Server function `getUserJobs({ filters, page })` com `requireSupabaseAuth`, filtra jobs cujos `target_ids` pertencem ao usuário.

Métricas no topo: jobs/hora, taxa de sucesso 24h, jobs em `dead_letter`, latência p95.

---

## 4. Dockerfile + deploy

`services/scraper/Dockerfile`:
```dockerfile
FROM mcr.microsoft.com/playwright:v1.48.0-jammy
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY tsconfig.json ./
COPY src ./src
ENV NODE_ENV=production
ENV RAW_PAYLOAD_LOCAL_PATH=/var/lib/jusradar/raw
RUN mkdir -p /var/lib/jusradar/raw
CMD ["npx","tsx","src/index.ts"]
```

`services/scraper/.dockerignore`, `fly.toml` e `railway.json` de exemplo.

`services/scraper/DEPLOY.md` cobrindo:
- Variáveis obrigatórias (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CREDENTIALS_ENCRYPTION_KEY`, pool size, concurrency)
- **Railway**: `railway up` no diretório, setar envs no dashboard, escalar para 1 réplica (worker singleton inicialmente)
- **Fly.io**: `fly launch --no-deploy`, ajustar `fly.toml` com volume para `/var/lib/jusradar/raw`, `fly secrets set …`, `fly deploy`
- Health check: endpoint HTTP `/healthz` opcional (adiciono mini servidor http no worker) para o provider matar pod travado
- Observabilidade: logs JSON já existem; instruções para `railway logs` e `fly logs`
- Como rodar 2+ workers (já é seguro: `pick_ingestion_jobs` usa `FOR UPDATE SKIP LOCKED`)

---

## Detalhes técnicos

**Migrações** (uma só):
- `tribunal_credentials` + RLS + `set_credential` + `get_credentials_for_scraper`
- Índice `ingestion_jobs(status, scheduled_for)` (se ainda não existir) p/ painel
- Nova `kind` permitida: `credential_check`

**Validações UI** (zod, em todas as forms):
- OAB: `^\d{1,7}$`, UF: 2 letras, senha: min 4 max 200, tribunal: enum

**Secret necessário**: `CREDENTIALS_ENCRYPTION_KEY` (peço via add_secret depois que aprovar o plano).

**Não faço nesta entrega**:
- Não rodo o worker (precisa do provider do usuário)
- Não resolvo captcha (aborta com erro tipado)
- Não implemento 1º grau TJRJ se não houver credencial — fica como `auth_required`

---

## Ordem de execução

1. Migração (tabela + funções + kind)
2. Pedir secret `CREDENTIALS_ENCRYPTION_KEY`
3. Adapter TJRJ + roteamento no worker
4. Server functions de credenciais + UI
5. Server function de jobs + UI
6. Dockerfile + DEPLOY.md
