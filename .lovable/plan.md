# Resumo expansível do processo no dashboard

Expor no card de cada processo todos os dados que o DataJud já entrega (classe, assuntos, órgão julgador, data de ajuizamento, último movimento, sigilo, sistema, formato), com aviso explícito quando partes não estão disponíveis. Tudo lido do banco — sem chamadas extras ao DataJud.

## Escopo

**Dentro:** card expandível na lista do dashboard (`/`), resumo com classe/assuntos/vara/datas/último movimento/metadados, aviso sobre partes com link pro portal TJRJ, resync dos processos já cadastrados.

**Fora:** página dedicada `/processos/:id`, timeline completa, botão "sincronizar agora" individual, mudanças em outras telas.

## Blocos de execução

### 1. Migration — novos campos em `processes`
Arquivo `supabase/migrations/<timestamp>_ensure_process_summary_fields.sql`, idempotente com `IF NOT EXISTS`:
- `filed_at TIMESTAMPTZ` (dataAjuizamento)
- `organ_code TEXT`, `organ_name TEXT`
- `municipality_ibge BIGINT`
- `secrecy_level INT DEFAULT 0`
- `system_name TEXT`, `format_name TEXT`
- `last_update_at TIMESTAMPTZ` (dataHoraUltimaAtualizacao)
- Índice em `filed_at DESC NULLS LAST`
- `UPDATE processes SET sync_status='pending' WHERE filed_at IS NULL` para forçar resync (sem filtro por `tribunal` — coluna existente é `tribunal_alias`)

### 2. Edge Function — `sync-process-by-number`
Substituir apenas `upsertProcess` para persistir os novos campos. Conversão de `dataAjuizamento` (YYYYMMDDHHMMSS) → ISO. Manter `tribunal_alias` (não criar coluna `tribunal`). Resto do arquivo intacto.

### 3. Server function — `src/lib/dashboard.functions.ts`
- Adicionar novos campos ao `select` de `processes`
- Buscar última movimentação por processo numa segunda query (`process_movements` ordenada por `occurred_at desc`, agrupar no JS pegando a primeira por `process_id`)
- Mapear cada processo com: `subjects[]` (zip de codes/names), `instanceLabel`, `secrecyLabel`, `lastMovement`, `filedAt`, `organName`, etc.
- Manter `requireSupabaseAuth` + `context.supabase` (padrão atual do arquivo) — não trocar por service client

### 4. Componente `src/components/processes/ProcessCard.tsx`
Card autônomo com:
- Header sempre visível: número, classe, órgão, badges (tribunal, instância, formato, sigilo), badge de novas/em-dia/sincronizando/não-encontrado/falha
- Botão "Ver resumo completo" / "Recolher resumo" controlando estado local `expanded`
- Seção expandida: grid de campos (ajuizado em, último movimento, total, última verificação), bloco destacado do movimento mais recente, lista de assuntos como chips, sistema/órgão completo, aviso amarelo sobre partes com link pro portal TJRJ
- Caso `not_found`: alerta amarelo no lugar do resumo
- Helpers `formatDateBR`, `formatFullDateBR`, `formatRelativeBR` no próprio arquivo
- **Estilo:** usar tokens semânticos do design system (`bg-card`, `text-muted-foreground`, `border`, `bg-accent`, `text-destructive`, etc.) e componentes `Card`/`Badge`/`Button` do shadcn em vez de classes Tailwind cruas tipo `bg-white`/`text-gray-600` do snippet de referência

### 5. Integração no dashboard
Substituir o render atual de processos em `src/components/DashboardProcesses.tsx` (não há `src/routes/index.tsx` direto — o dashboard renderiza via esse componente) pelo `<ProcessCard process={p} />`. Remover o bloco antigo de "Sincronizar agora" + `ProcessMovementsTree` inline? **Confirmar:** spec diz que botão de sync individual está fora de escopo, mas ele já existe hoje. Vou **manter** o botão "Sincronizar agora" e o tree de histórico que foram adicionados na iteração anterior, e apenas envolver o resumo do processo no novo `ProcessCard` — isso preserva funcionalidade já entregue ao usuário.

### 6. Resync
Após deploy da Edge Function, disparar `sync-all-processes` uma vez para popular os novos campos nos processos existentes (a migration já marcou todos como `pending`).

## Detalhes técnicos

- **Schema atual:** coluna é `tribunal_alias` (não `tribunal`). Ajustar todas as referências do snippet original.
- **Server function existente:** `getDashboard` em `src/lib/dashboard.functions.ts` usa `requireSupabaseAuth` middleware com `context.supabase` (RLS), não service client. Preservar esse padrão.
- **Order by aninhado:** `.order('process(last_movement_at)', ...)` pode não funcionar em todas as versões do PostgREST; manter ordenação atual por `first_linked_at` se falhar, ou ordenar em JS após mapeamento.
- **Componente isolado:** `ProcessCard` autônomo, mas as ações já existentes (Sincronizar agora, Ver histórico paginado) ficam fora dele e continuam no `DashboardProcesses` ao redor — para não regredir a feature anterior.

## Pergunta de confirmação
O snippet do Bloco 5 sugere remover toda a renderização inline antiga, o que apagaria o botão "Sincronizar agora" e o `ProcessMovementsTree` adicionados na iteração passada. Confirma manter esses dois (sync manual + árvore de histórico) acoplados ao novo `ProcessCard`, ou remove tudo e fica só com o card de resumo + cron?
