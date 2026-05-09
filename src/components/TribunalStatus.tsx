// @ts-nocheck
import { useState } from "react";
import { Icon } from "./Icon";
import { Utils } from "../lib/jr-utils";

function StatusDot({ status }) {
  if (status === "ativo")
    return (
      <span className="relative grid place-items-center h-3 w-3" aria-label="ativo">
        <span className="absolute inline-flex h-3 w-3 rounded-full bg-emerald-400 opacity-60 animate-ping" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
    );
  if (status === "atrasado")
    return <span className="h-2 w-2 rounded-full bg-amber-500 inline-block" aria-label="atrasado" />;
  return <span className="h-2 w-2 rounded-full bg-red-500 inline-block" aria-label="offline" />;
}

export function TribunalStatus({ tribunais, compact = false }) {
  const [open, setOpen] = useState(true);
  const ativos    = tribunais.filter((t) => t.status === "ativo").length;
  const atrasados = tribunais.filter((t) => t.status === "atrasado").length;
  const offline   = tribunais.filter((t) => t.status === "offline").length;

  return (
    <section className={Utils.cx("rounded-lg border border-zinc-200 bg-white", compact && "lg:bg-transparent")}>
      <button className="w-full flex items-center justify-between px-4 py-3 lg:cursor-default"
        onClick={() => compact && setOpen((s) => !s)} aria-expanded={open}>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Tribunais rastreados</span>
          <span className="text-[11px] text-zinc-400 tabular-nums">{ativos}/{tribunais.length} ativos</span>
        </div>
        <div className="flex items-center gap-2">
          {atrasados + offline > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
              <Icon name="alert-circle" className="h-3 w-3" />
              {atrasados + offline} com problema
            </span>
          )}
          <Icon name="chevron-down" className={Utils.cx("h-4 w-4 text-zinc-400 transition lg:hidden", open && "rotate-180")} />
        </div>
      </button>

      {open && (
        <ul className="divide-y divide-zinc-100 border-t border-zinc-100">
          {tribunais.map((t) => (
            <li key={t.sigla} className="flex items-center gap-3 px-4 py-2.5">
              <StatusDot status={t.status} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-[13px] font-medium text-zinc-900">{t.sigla}</span>
                  <span className="text-[11px] text-zinc-500 truncate">{t.nome}</span>
                </div>
                <div className="text-[11px] text-zinc-400 flex items-center gap-1 mt-0.5">
                  <Icon name="refresh-ccw" className="h-2.5 w-2.5" />
                  Sync: {Utils.tempoRelativo(t.ultimaSync)}
                </div>
              </div>
              <span className={Utils.cx(
                "text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded",
                t.status === "ativo" && "text-emerald-700 bg-emerald-50",
                t.status === "atrasado" && "text-amber-700 bg-amber-50",
                t.status === "offline" && "text-red-700 bg-red-50"
              )}>
                {t.status === "ativo" ? "OK" : t.status === "atrasado" ? "Atraso" : "Offline"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
export default TribunalStatus;
