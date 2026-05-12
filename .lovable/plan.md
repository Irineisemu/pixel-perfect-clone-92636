
## Diagnóstico

A server function `createLawyerTarget` (em `src/lib/lawyer.functions.ts`) usa `.middleware([requireSupabaseAuth])`. O middleware (`src/integrations/supabase/auth-middleware.ts`) só lê o header `Authorization: Bearer <token>` da request — se faltar, lança 401.

No frontend, `useServerFn` faz um `fetch` simples para `/_serverFn/<hash>` e **não anexa header nenhum**. A sessão do Supabase fica no `localStorage` (não em cookie), então o servidor nunca vê o token. Resultado: **toda chamada protegida cai em 401**, não só a do lawyer (mesma falha existe em `getDiscoveryStatus`, `triggerRediscovery`, `getIngestionHealth` etc — só não aparecia ainda porque o usuário não tinha exercitado esses caminhos).

Não falta cookie SSR — o middleware atual é baseado em Bearer. A solução mais cirúrgica é manter o contrato (Bearer token) e adicionar um **client middleware global** que pega `session.access_token` do Supabase e injeta no header antes de cada `_serverFn` sair do navegador.

## Arquivos auditados

- `src/integrations/supabase/auth-middleware.ts` — middleware server-side, espera `Authorization: Bearer …`.
- `src/integrations/supabase/client.ts` — browser client com `persistSession: true` em localStorage. ✅
- `src/integrations/supabase/client.server.ts` — admin (service role). ✅
- `src/lib/lawyer.functions.ts` — `createLawyerTarget`, `getDiscoveryStatus`, `triggerRediscovery` todos protegidos por `requireSupabaseAuth`.
- `src/lib/ingestion.functions.ts` — várias funções idem.
- `src/start.ts` — `createStart` configurado só com `requestMiddleware` server-side; sem `functionMiddleware`.
- `src/router.tsx`, `src/routes/__root.tsx`, `src/routes/_authenticated.tsx` — sem hook que injete token no fetcher.
- `src/lib/auth.tsx` — provider mantém sessão no client.

Conclusão: ninguém anexa Bearer ao `_serverFn`. Esse é o bug.

## Plano

1. **Criar `src/lib/server-fn-client-middleware.ts`** com um middleware `clientFunctionMiddleware`:
   - Tipo `function` (`createMiddleware({ type: 'function' })`).
   - Implementa `.client(async ({ next })`: chama `supabase.auth.getSession()` e, se houver sessão, faz `next({ sendContext: {}, headers: { Authorization: \`Bearer ${session.access_token}\` } })`. Se não houver sessão, chama `next()` sem header (a função protegida vai 401, mas funções públicas continuam OK).
   - Não tem `.server()` — só roda no browser.

2. **Registrar o middleware globalmente em `src/start.ts`** via `createStart(() => ({ requestMiddleware: [errorMiddleware], functionMiddleware: [clientFunctionMiddleware] }))`. Assim toda `createServerFn` herda automaticamente, sem precisar tocar em cada arquivo `.functions.ts`.

3. **Melhorar erros de `createLawyerTarget`** (qualidade): o handler hoje faz `throw new Error("failed_to_create_target")` no caso de insert falhar — substituir por `throw new Response(JSON.stringify({ code, message, db_error }), { status: 500, headers: ... })` para que o front consiga parsear `code`/`message`. Mesmo tratamento para `not_found` em `getDiscoveryStatus`/`triggerRediscovery`.

4. **Logs temporários**: adicionar `console.log("[createLawyerTarget] userId=", userId)` no início do handler e `console.log("[clientFnMw] hasSession=", !!session)` no client middleware para confirmar via console + server-function-logs.

5. **Tratamento no `LawyerTargetForm` / `Alvos.tsx`**: o `catch` do `onSave` tenta extrair `err.response?.code`. Garantir que faz `if (err instanceof Response) errorBody = await err.json()` antes de mapear códigos. (Pequena edição no handler do botão Salvar em `Alvos.tsx`.)

## Verificação pós-implementação

1. Recarregar app, abrir DevTools → Network.
2. Criar um lawyer com OAB `RJ183970`.
3. Esperar request `POST /_serverFn/<hash>` → deve ter `Authorization: Bearer ey…` nos request headers.
4. Resposta 200 + JSON `{ ok: true, target, runId, discovery_url }`.
5. Redireciona para `/alvos/<id>/descoberta`.
6. Conferir `server-function-logs` mostrando `[createLawyerTarget] userId=<uuid>`.

## Notas

- Não vamos migrar para `@supabase/ssr` / cookies: o middleware Bearer atual é o padrão deste template e funciona para todas as outras funções; basta destravar o client.
- `functionMiddleware` global cobre **todas** as `createServerFn`, eliminando inconsistência futura.
- Após validação, podemos remover os `console.log` de debug.
