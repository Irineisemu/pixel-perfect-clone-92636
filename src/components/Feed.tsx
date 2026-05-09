// @ts-nocheck
import { useEffect, useRef } from "react";
import { Icon } from "./Icon";
import { Utils } from "../lib/jr-utils";

export function UrgencyBadge({ urgencia }) {
  const u = Utils.URGENCIA[urgencia];
  return (
    <span className={Utils.cx(
      "inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded border text-[10.5px] font-medium uppercase tracking-wide",
      u.badge
    )}>
      <span className={Utils.cx("h-1.5 w-1.5 rounded-full", u.dot)} />
      {u.label}
    </span>
  );
}

function targetLabel(t) {
  if (t.type === "person")  return t.full_name;
  if (t.type === "process") return t.nickname || t.process_number;
  return (t.keywords?.[0] && `radar "${t.keywords[0]}"`) || `radar ${t.tribunal_aliases?.join(",")}`;
}

function FeedRow({ m, onClick, target, onTargetClick }) {
  const u = Utils.URGENCIA[m.urgencia];
  return (
    <tr onClick={onClick} className="group cursor-pointer border-b border-zinc-100 hover:bg-zinc-50/70 transition"
        tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onClick(); }}
        aria-label={`Movimento ${m.numero} — ${m.tipo}`}>
      <td className="py-3 pl-4 pr-2 align-top w-1 relative">
        <span className={Utils.cx("absolute left-0 top-2 bottom-2 w-0.5 rounded-full", u.bar)} />
        <UrgencyBadge urgencia={m.urgencia} />
      </td>
      <td className="py-3 px-3 align-top">
        <div className="font-mono text-[12px] text-zinc-900 tabular-nums">{m.numero}</div>
        <div className="text-[11.5px] text-zinc-500 mt-0.5 line-clamp-1">{m.resumo}</div>
        {target && (
          <button onClick={(e) => { e.stopPropagation(); onTargetClick(target); }}
            title="Filtrar feed por este alvo"
            className="mt-1.5 inline-flex items-center gap-1 h-5 px-1.5 rounded-full bg-zinc-100 hover:bg-zinc-200 text-[10.5px] text-zinc-700">
            <Icon name="target" className="h-2.5 w-2.5" />
            <span className="truncate max-w-[180px]">Capturado por: {targetLabel(target)}</span>
          </button>
        )}
      </td>
      <td className="py-3 px-3 align-top">
        <div className="text-[13px] text-zinc-900 font-medium">{m.tribunal}</div>
        <div className="text-[11.5px] text-zinc-500 line-clamp-1">{m.tribunalNome}</div>
      </td>
      <td className="py-3 px-3 align-top">
        <div className="text-[13px] text-zinc-800">{m.tipo}</div>
        {m.contraEstado && <div className="text-[10.5px] text-zinc-500 mt-0.5">contra ente público</div>}
      </td>
      <td className="py-3 px-3 align-top">
        <div className="text-[13px] text-zinc-900 line-clamp-1">{m.parte}</div>
        <div className="text-[11.5px] text-zinc-500 line-clamp-1">{m.parteQualificacao}</div>
      </td>
      <td className="py-3 px-3 align-top text-right">
        <div className="text-[12px] text-zinc-700 tabular-nums whitespace-nowrap">{Utils.tempoRelativo(m.publicadoEm)}</div>
        {m.prazo && (
          <div className="text-[11px] text-red-600 mt-0.5 inline-flex items-center gap-1 whitespace-nowrap">
            <Icon name="clock" className="h-2.5 w-2.5" /> prazo
          </div>
        )}
      </td>
      <td className="py-3 pr-4 pl-1 align-top w-1">
        <Icon name="chevron-right" className="h-4 w-4 text-zinc-300 group-hover:text-zinc-600 transition" />
      </td>
    </tr>
  );
}

function FeedCard({ m, onClick, target, onTargetClick }) {
  const u = Utils.URGENCIA[m.urgencia];
  return (
    <button onClick={onClick} className="w-full text-left rounded-lg border border-zinc-200 bg-white p-3 hover:border-zinc-300 transition relative overflow-hidden">
      <span className={Utils.cx("absolute left-0 top-3 bottom-3 w-0.5 rounded-r-full", u.bar)} />
      <div className="flex items-center justify-between gap-2 pl-2">
        <UrgencyBadge urgencia={m.urgencia} />
        <span className="text-[11px] text-zinc-500 tabular-nums">{Utils.tempoRelativo(m.publicadoEm)}</span>
      </div>
      <div className="mt-2 pl-2">
        <div className="font-mono text-[11.5px] text-zinc-900 tabular-nums">{m.numero}</div>
        <div className="text-[13px] text-zinc-900 font-medium mt-0.5">{m.tipo}</div>
        <div className="text-[12px] text-zinc-600 mt-0.5 line-clamp-2">{m.resumo}</div>
      </div>
      <div className="mt-2.5 pl-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-zinc-500">
        <span className="inline-flex items-center gap-1"><Icon name="building-2" className="h-3 w-3" />{m.tribunal}</span>
        <span className="inline-flex items-center gap-1 truncate"><Icon name="user" className="h-3 w-3" />{m.parte}</span>
        {target && (
          <span onClick={(e) => { e.stopPropagation(); onTargetClick(target); }}
            className="inline-flex items-center gap-1 px-1.5 h-5 rounded-full bg-zinc-100 text-zinc-700 text-[10.5px]">
            <Icon name="target" className="h-2.5 w-2.5" /> {targetLabel(target)}
          </span>
        )}
      </div>
    </button>
  );
}

export function Feed({ items, loading, onSelect, onLoadMore, hasMore, targetByMov = {}, onFilterByTarget = () => {} }) {
  const sentinelRef = useRef(null);
  useEffect(() => {
    if (!hasMore || loading) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) onLoadMore(); },
      { rootMargin: "200px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loading, onLoadMore]);

  if (!loading && items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 p-10 text-center">
        <div className="grid place-items-center mx-auto h-10 w-10 rounded-full bg-white border border-zinc-200">
          <Icon name="inbox" className="h-5 w-5 text-zinc-400" />
        </div>
        <h3 className="mt-3 text-[14px] font-medium text-zinc-900">Nenhuma movimentação encontrada</h3>
        <p className="mt-1 text-[12.5px] text-zinc-500 max-w-sm mx-auto">
          Tente alterar os filtros ou ampliar o período. Suas regras de monitoramento continuam ativas em segundo plano.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="hidden lg:block rounded-lg border border-zinc-200 bg-white overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-zinc-50/60 border-b border-zinc-200">
            <tr className="text-[10.5px] font-semibold uppercase tracking-wider text-zinc-500">
              <th className="py-2.5 pl-4 pr-2">Urgência</th>
              <th className="py-2.5 px-3">Nº Processo</th>
              <th className="py-2.5 px-3">Tribunal</th>
              <th className="py-2.5 px-3">Tipo de movimento</th>
              <th className="py-2.5 px-3">Parte monitorada</th>
              <th className="py-2.5 px-3 text-right">Quando</th>
              <th className="py-2.5 pr-4 pl-1"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((m) => <FeedRow key={m.id} m={m} onClick={() => onSelect(m)} target={targetByMov[m.id]} onTargetClick={onFilterByTarget} />)}
            {loading && Array.from({ length: 3 }).map((_, i) => (
              <tr key={`sk-${i}`} className="border-b border-zinc-100">
                {Array.from({ length: 7 }).map((__, j) => (
                  <td key={j} className="py-3 px-3"><div className="h-3 rounded bg-zinc-100 animate-pulse" /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="lg:hidden grid gap-2">
        {items.map((m) => <FeedCard key={m.id} m={m} onClick={() => onSelect(m)} target={targetByMov[m.id]} onTargetClick={onFilterByTarget} />)}
        {loading && Array.from({ length: 3 }).map((_, i) => (
          <div key={`sk-${i}`} className="h-24 rounded-lg border border-zinc-200 bg-white animate-pulse" />
        ))}
      </div>

      <div ref={sentinelRef} className="py-4 text-center text-[12px] text-zinc-500">
        {hasMore ? (
          <span className="inline-flex items-center gap-2">
            <Icon name="loader" className="h-3.5 w-3.5 animate-spin" /> Carregando mais…
          </span>
        ) : (
          <span>Você visualizou todas as {items.length} movimentações.</span>
        )}
      </div>
    </div>
  );
}
export default Feed;
