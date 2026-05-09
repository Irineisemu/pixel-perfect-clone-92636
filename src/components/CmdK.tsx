// @ts-nocheck
import { useState, useEffect, useRef } from "react";
import { Icon } from "./Icon";
import { Mock } from "../data/mock";

function Group({ title, children }) {
  return (
    <div className="px-1">
      <div className="px-2 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-zinc-400">{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
function Item({ icon, primary, secondary, onSelect }) {
  return (
    <button onClick={onSelect} className="w-full flex items-center gap-3 px-2 py-2 rounded-md hover:bg-zinc-100 text-left">
      <Icon name={icon} className="h-3.5 w-3.5 text-zinc-400" />
      <span className="flex-1 min-w-0">
        <span className="block text-zinc-900 truncate font-medium">{primary}</span>
        <span className="block text-zinc-500 text-[12px] truncate">{secondary}</span>
      </span>
      <Icon name="arrow-right" className="h-3.5 w-3.5 text-zinc-300" />
    </button>
  );
}

export function CmdK({ open, onClose, onSelectMov }) {
  const { movimentacoes, tribunais } = Mock;
  const [q, setQ] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    setTimeout(() => inputRef.current?.focus(), 50);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const ql = q.trim().toLowerCase();
  const matchMov = movimentacoes.filter((m) =>
    !ql || m.numero.includes(ql) || m.parte.toLowerCase().includes(ql) || m.tipo.toLowerCase().includes(ql)
  ).slice(0, 6);
  const matchTri = tribunais.filter((t) =>
    !ql || t.sigla.toLowerCase().includes(ql) || t.nome.toLowerCase().includes(ql)
  ).slice(0, 4);

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-4">
      <div className="absolute inset-0 bg-zinc-900/40" onClick={onClose} />
      <div className="relative w-full max-w-xl rounded-xl border border-zinc-200 bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-3 h-12 border-b border-zinc-200">
          <Icon name="search" className="h-4 w-4 text-zinc-400" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar processos, partes, tribunais…"
            className="flex-1 outline-none text-[14px] bg-transparent placeholder:text-zinc-400"
            aria-label="Campo de busca" />
          <kbd className="text-[10px] text-zinc-500 border border-zinc-200 rounded px-1.5 py-0.5">esc</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-2 text-[13px]">
          {matchMov.length > 0 && (
            <Group title="Movimentações">
              {matchMov.map((m) => (
                <Item key={m.id} icon="hash" primary={m.numero} secondary={`${m.tipo} — ${m.parte}`}
                  onSelect={() => { onClose(); onSelectMov(m); }} />
              ))}
            </Group>
          )}
          {matchTri.length > 0 && (
            <Group title="Tribunais">
              {matchTri.map((t) => (
                <Item key={t.sigla} icon="building-2" primary={t.sigla} secondary={t.nome} onSelect={onClose} />
              ))}
            </Group>
          )}
          {matchMov.length === 0 && matchTri.length === 0 && (
            <div className="p-6 text-center text-zinc-500 text-[12.5px]">Nada encontrado para "{q}".</div>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 px-3 h-9 border-t border-zinc-200 bg-zinc-50/60 text-[11px] text-zinc-500">
          <span>Busca global</span>
          <span className="inline-flex items-center gap-1">Enter para abrir <Icon name="corner-down-left" className="h-3 w-3" /></span>
        </div>
      </div>
    </div>
  );
}
export default CmdK;
