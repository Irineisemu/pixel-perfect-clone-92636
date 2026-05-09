// @ts-nocheck
import { useState } from "react";
import { Icon } from "./Icon";
import { Utils } from "../lib/jr-utils";

function Chip({ active, children, onClick, count }) {
  return (
    <button onClick={onClick} aria-pressed={active}
      className={Utils.cx(
        "inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-[12.5px] font-medium transition",
        active ? "bg-zinc-900 border-zinc-900 text-white"
               : "bg-white border-zinc-200 text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
      )}>
      {children}
      {typeof count === "number" && (
        <span className={Utils.cx(
          "tabular-nums text-[10.5px] px-1 rounded",
          active ? "bg-white/15 text-white" : "bg-zinc-100 text-zinc-600"
        )}>{count}</span>
      )}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

export function Filtros({ filtros, setFiltros, counts, tribunaisDisponiveis, alvos = [] }) {
  const [open, setOpen] = useState(false);
  const update = (patch) => setFiltros((f) => ({ ...f, ...patch }));
  const ativos =
    (filtros.tribunal !== "todos" ? 1 : 0) +
    (filtros.urgencia !== "todas" ? 1 : 0) +
    (filtros.periodo !== "todos" ? 1 : 0) +
    (filtros.q.trim() ? 1 : 0) +
    (filtros.alvoId ? 1 : 0);

  const alvoSel = alvos.find((a) => a.id === filtros.alvoId);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Chip active={filtros.preset === "todos"} onClick={() => update({ preset: "todos" })} count={counts.todos}>Todos</Chip>
        <Chip active={filtros.preset === "estado"} onClick={() => update({ preset: "estado" })} count={counts.estado}>Ações contra o Estado</Chip>
        <Chip active={filtros.preset === "professores"} onClick={() => update({ preset: "professores" })} count={counts.professores}>Professores</Chip>

        {alvoSel && (
          <span className="inline-flex items-center gap-1.5 h-8 pl-2.5 pr-1.5 rounded-full bg-zinc-900 text-white text-[12px] font-medium">
            <Icon name="target" className="h-3 w-3" />
            {alvoSel.type === "person" ? alvoSel.full_name :
             alvoSel.type === "process" ? (alvoSel.nickname || alvoSel.process_number) :
             (alvoSel.keywords?.[0] ? `radar "${alvoSel.keywords[0]}"` : "radar")}
            <button onClick={() => update({ alvoId: "" })} aria-label="Remover filtro de alvo"
              className="grid h-5 w-5 place-items-center rounded-full hover:bg-white/10">
              <Icon name="x" className="h-3 w-3" />
            </button>
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setOpen((s) => !s)} aria-expanded={open}
            className={Utils.cx(
              "inline-flex items-center gap-1.5 h-8 px-3 rounded-md border text-[12.5px] font-medium transition",
              ativos > 0 ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
            )}>
            <Icon name="filter" className="h-3.5 w-3.5" />
            Filtros
            {ativos > 0 && <span className="bg-white/15 text-white px-1 rounded text-[10.5px] tabular-nums">{ativos}</span>}
            <Icon name="chevron-down" className={Utils.cx("h-3.5 w-3.5 transition", open && "rotate-180")} />
          </button>
        </div>
      </div>

      {open && (
        <div className="rounded-lg border border-zinc-200 bg-white p-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="Tribunal">
            <select value={filtros.tribunal} onChange={(e) => update({ tribunal: e.target.value })}
              className="w-full h-9 px-2.5 rounded-md border border-zinc-200 bg-white text-[13px] focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400">
              <option value="todos">Todos os tribunais</option>
              {tribunaisDisponiveis.map((t) => (
                <option key={t.sigla} value={t.sigla}>{t.sigla} — {t.nome}</option>
              ))}
            </select>
          </Field>
          <Field label="Urgência">
            <select value={filtros.urgencia} onChange={(e) => update({ urgencia: e.target.value })}
              className="w-full h-9 px-2.5 rounded-md border border-zinc-200 bg-white text-[13px] focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400">
              <option value="todas">Todas urgências</option>
              <option value="critico">Crítico</option>
              <option value="alto">Alto</option>
              <option value="medio">Médio</option>
              <option value="info">Informativo</option>
            </select>
          </Field>
          <Field label="Período">
            <select value={filtros.periodo} onChange={(e) => update({ periodo: e.target.value })}
              className="w-full h-9 px-2.5 rounded-md border border-zinc-200 bg-white text-[13px] focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400">
              <option value="todos">Qualquer data</option>
              <option value="24h">Últimas 24h</option>
              <option value="7d">Últimos 7 dias</option>
              <option value="30d">Últimos 30 dias</option>
            </select>
          </Field>
          <Field label="Busca por parte">
            <input type="text" value={filtros.q} placeholder="Nome ou qualificação"
              onChange={(e) => update({ q: e.target.value })}
              className="w-full h-9 px-2.5 rounded-md border border-zinc-200 bg-white text-[13px] focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400" />
          </Field>
          <Field label="Por alvo">
            <select value={filtros.alvoId || ""} onChange={(e) => update({ alvoId: e.target.value })}
              className="w-full h-9 px-2.5 rounded-md border border-zinc-200 bg-white text-[13px] focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400">
              <option value="">Qualquer alvo</option>
              {alvos.map((a) => {
                const label =
                  a.type === "person"  ? `👤 ${a.full_name}` :
                  a.type === "process" ? `📄 ${a.nickname || a.process_number}` :
                  `📡 ${(a.keywords?.[0] && `radar "${a.keywords[0]}"`) || `radar ${a.tribunal_aliases?.join(",")}`}`;
                return <option key={a.id} value={a.id}>{label}</option>;
              })}
            </select>
          </Field>

          {ativos > 0 && (
            <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
              <button onClick={() => update({ tribunal: "todos", urgencia: "todas", periodo: "todos", q: "", alvoId: "" })}
                className="inline-flex items-center gap-1 text-[12.5px] text-zinc-600 hover:text-zinc-900">
                <Icon name="x" className="h-3.5 w-3.5" /> Limpar filtros
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
export default Filtros;
