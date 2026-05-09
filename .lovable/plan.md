## Objetivo

Transformar o protótipo JusRadar enviado (HTML standalone com React/Babel via CDN) num app real dentro deste projeto (TanStack Start + React 19 + Tailwind v4 + shadcn), preservando layout, comportamento e dados mock.

## Estrutura de rotas

Substituir o roteamento por hash (`#/`, `#/alvos`, `#/configuracoes`) por rotas reais do TanStack:

- `src/routes/index.tsx` → Dashboard (Header, KPIs, TribunalStatus, Filtros, Feed, Drawer, RegrasCard, CmdK)
- `src/routes/alvos.tsx` → Página Alvos
- `src/routes/configuracoes.tsx` → Página Configurações
- `src/routes/__root.tsx` → manter shell, atualizar `<title>`/meta para "JusRadar — Painel" (pt-BR), incluir `<Header>` + `<Outlet/>` se fizer sentido como layout, ou deixar Header dentro de cada rota.

Cada rota define `head()` próprio com title/description em pt-BR.

## Componentes e libs

Migrar os arquivos `.jsx` (Babel global, IIFE com `window.X`) para módulos TS/TSX com imports/exports normais:

- `src/components/jusradar/Header.tsx`
- `src/components/jusradar/Kpis.tsx`
- `src/components/jusradar/TribunalStatus.tsx`
- `src/components/jusradar/Filtros.tsx`
- `src/components/jusradar/Feed.tsx`
- `src/components/jusradar/Drawer.tsx`
- `src/components/jusradar/CmdK.tsx`
- `src/components/jusradar/Toaster.tsx` (ou reusar `sonner` já presente)
- `src/components/jusradar/RegrasCard.tsx` (extraído do App)
- `src/lib/jusradar/icons.tsx` (ou substituir por `lucide-react`, já disponível)
- `src/lib/jusradar/utils.ts` (Utils, NOW, isProfessor, formatadores)
- `src/lib/jusradar/useTargets.ts` (hook + tipos)
- `src/data/jusradar/mock.ts` (movimentações, tribunais)
- `src/pages/Alvos.jsx` → `src/components/jusradar/AlvosPage.tsx`
- `src/pages/Configuracoes.jsx` → `src/components/jusradar/ConfiguracoesPage.tsx`

Remover globals `window.Mock`, `window.Utils`, `window.Icons`, `window.TargetsAPI`, `window.UI` — converter para imports nomeados.

## Estilo / design system

- Tailwind v4 já está ativo via `src/styles.css`. Não usar Tailwind CDN.
- Adicionar fontes Grafika e Roboto Bold Condensed:
  - copiar `fonts/Grafika.ttf` e `fonts/RobotoBoldCondensed.ttf` para `public/fonts/`
  - declarar `@font-face` em `src/styles.css` e expor como família via `@theme` (`--font-display`, `--font-sans`)
- Os componentes do protótipo usam classes diretas `bg-white`, `text-zinc-*`, `border-zinc-200`. Para respeitar a regra de design tokens do projeto, mapear para tokens semânticos (`bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`) ajustando os valores de `:root`/`.dark` em `src/styles.css` para um tema claro neutro próximo ao zinc original. Manter aparência visual idêntica.
- Persistir o estilo de scrollbar e animação `animate-in` em `styles.css`.

## Dados / persistência

- Manter o mock estático em `src/data/jusradar/mock.ts`.
- `useTargets` hoje persiste em `localStorage` — manter, com guard `typeof window !== "undefined"` para SSR do TanStack Start.

## Estado e navegação interna

- Substituir `window.location.hash` por `Link`/`useNavigate` do `@tanstack/react-router`.
- CmdK (atalho ⌘K) continua client-side; envolver listeners em `useEffect`.

## Detalhes técnicos

- Converter IIFEs `(function(){ ... })()` em módulos ES com `export`.
- Tipar props mínimas (sem reescrever lógica). `any` permitido onde acelera a portabilidade, mas tipar entidades principais (`Movimentacao`, `Tribunal`, `Target`).
- Substituir ícones SVG inline de `Icons.jsx` por equivalentes `lucide-react` quando trivial; manter SVG custom quando não houver equivalente.
- Toaster: usar `sonner` (`src/components/ui/sonner.tsx`) em vez do Toaster custom, mantendo a API `toast(...)`.
- Remover placeholder atual de `src/routes/index.tsx`.

## Verificação

- Após edits, conferir build (automático), abrir preview e validar:
  - dashboard carrega com KPIs, status de tribunais, lista de movimentações
  - filtros (preset, tribunal, urgência, período, busca, alvo) funcionam
  - paginação infinita ("Carregar mais")
  - drawer de detalhe abre/fecha
  - CmdK abre com ⌘K / Ctrl+K
  - navegação `/`, `/alvos`, `/configuracoes`
  - persistência de alvos no localStorage

## Fora do escopo

- Backend / Lovable Cloud / autenticação (tudo permanece mock).
- Modo escuro novo (mantém aparência clara do protótipo).
- Refator profundo dos componentes (porta 1:1, apenas adapta para módulos e tokens).
