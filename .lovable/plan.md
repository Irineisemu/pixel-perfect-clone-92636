## Diagnóstico

A descoberta NÃO está parada em `pending` por falta de integração — a pipeline completa já existe e foi executada:

```
createLawyerTarget → startDiscoveryRun → ingestion_jobs(kind=lawyer_discovery)
   → /api/public/ingestion/tick (pg_cron) → processDataJudJobs
   → runLawyerDiscoveryJob → searchByOab (DataJud)
```

Verifiquei o banco: o job da OAB `RJ183970` rodou (`status=done`), criou um `discovery_run` que terminou como **`failed`** com este erro do DataJud:

```
client 400: query_shard_exception — failed to create query:
[nested] failed to find nested object under path [partes.representantes]
```

**Causa raiz:** O índice `api_publica_tjrj` NÃO tem mapping `nested` para `partes.representantes`. A query nested retorna HTTP 400. Em `src/ingestion/adapters/datajud/lawyer-search.ts`, o `postQuery` faz `throw new LawyerSearchError("client", 400)` em qualquer 4xx — então o fallback para a variante `flat` em `searchByOab` nunca é alcançado, porque a função explode antes do `extractPage`.

O spec (Bloco 1, função `processOAB`) descreve fallback baseado em `hits.length===0`, mas a realidade é que o TJRJ rejeita a query com 400. Precisa de fallback baseado em **erro 400 com `query_shard_exception`** também.

Tudo o mais que o spec pede (server functions de discovery e status, polling na UI, persistência idempotente, mascaramento de logs, hard cap, rate-limit, ownership, sem notificações na descoberta inicial) **já está implementado** em `src/lib/lawyer.functions.ts`, `src/ingestion/adapters/datajud/lawyer-search.ts` e `src/routes/_authenticated/alvos/$targetId/descoberta.tsx`. Reescrever tudo do zero como pede o `<deliverable_structure>` seria duplicação destrutiva.

`DATAJUD_API_KEY` está configurada (verifiquei nos secrets).

## Plano cirúrgico

### 1. `src/ingestion/adapters/datajud/lawyer-search.ts` — fallback robusto
- Em `searchByOab`, envolver a tentativa nested em `try/catch`. Se cair em `LawyerSearchError` com `kind==="client"` e `httpStatus===400` (sintoma típico de mapping ausente), em vez de propagar, fazer fallback automático para a variante `flat`.
- Manter o fallback existente baseado em `hits.length===0` (cobre tribunais que respondem 200 vazio em vez de 400).
- Cachear a variante vencedora como já é feito (`preferVariant`).

### 2. `src/lib/lawyer.functions.ts` — retry de runs `failed` por mapping
- Na primeira ocorrência de `client: client 400` em `runLawyerDiscoveryJob`, marcar `last_error_kind="datajud_mapping_400"` no job para diagnóstico (campo já existe).
- Sem outras mudanças no worker — a lógica de upsert/link/hash/progress está correta e respeita todos os constraints do spec.

### 3. Reprocessar o run que ficou `failed`
- Após o fix, executar manualmente (via UI no botão "Tentar novamente" ou via `triggerRediscovery`) para a OAB `RJ183970` e validar que processos aparecem.

### 4. Validação
SQL pós-fix:
```sql
-- run mais recente deve ficar 'completed' ou 'partial' com total_found > 0
SELECT status, total_found, by_oab, errors
FROM discovery_runs
WHERE target_id = '448bef0f-0135-4401-8e93-7181ad008d13'
ORDER BY started_at DESC LIMIT 1;

-- vínculos criados
SELECT COUNT(*) FROM target_process_links
WHERE target_id = '448bef0f-0135-4401-8e93-7181ad008d13'
  AND unlinked_at IS NULL;

-- processos persistidos
SELECT process_number, last_synced_at FROM processes
WHERE id IN (
  SELECT process_id FROM target_process_links
  WHERE target_id = '448bef0f-0135-4401-8e93-7181ad008d13'
) LIMIT 5;
```

## Por que NÃO seguir o `<deliverable_structure>` ao pé da letra

O spec assume estado zero ("hoje ficam parados com pending porque o código de descoberta ainda não está integrado"). A realidade é que a integração já foi feita em entregas anteriores desta thread (job-queue + tick endpoint + worker + UI de progresso), e a única coisa quebrada é a árvore de fallback de queries DataJud para o TJRJ específico. Recriar `discoverLawyerProcesses`, `getDiscoveryStatus`, `DiscoveryProgress.tsx` etc. duplicaria nomes, conflitaria com o que está em produção e regrediria a arquitetura assíncrona baseada em jobs (que é mais robusta que `queueMicrotask`).

Posso seguir o `<deliverable_structure>` literalmente se você quiser, mas recomendo o plano cirúrgico acima.
