// @ts-nocheck
import { useState, useEffect, useRef } from "react";
import { Icon } from "./Icon";
import { supabase } from "@/integrations/supabase/client";

function formatProcessNumber(digits) {
  if (!digits) return "";
  if (digits.length !== 20) return digits;
  return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(13, 14)}.${digits.slice(14, 16)}.${digits.slice(16, 20)}`;
}

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

export function CmdK({ open, onClose }) {
  const [q, setQ] = useState("");
  const [processes, setProcesses] = useState([]);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    setTimeout(() => inputRef.current?.focus(), 50);
    (async () => {
      const { data } = await supabase
        .from("processes")
        .select("id, process_number, class_name, organ_name")
        .order("last_synced_at", { ascending: false })
        .limit(50);
      setProcesses(data || []);
    })();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const ql = q.trim().toLowerCase();
  const matches = processes.filter((p) => {
    if (!ql) return true;
    return (
      (p.process_number || "").includes(ql.replace(/\D/g, "")) ||
      (p.class_name || "").toLowerCase().includes(ql) ||
      (p.organ_name || "").toLowerCase().includes(ql)
    );
  }).slice(0, 8);

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-4">
      <div className="absolute inset-0 bg-zinc-900/40" onClick={onClose} />
      <div className="relative w-full max-w-xl rounded-xl border border-zinc-200 bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-3 h-12 border-b border-zinc-200">
          <Icon name="search" className="h-4 w-4 text-zinc-400" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar processos por número, classe ou órgão…"
            className="flex-1 outline-none text-[14px] bg-transparent placeholder:text-zinc-400"
            aria-label="Campo de busca" />
          <kbd className="text-[10px] text-zinc-500 border border-zinc-200 rounded px-1.5 py-0.5">esc</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-2 text-[13px]">
          {matches.length > 0 ? (
            <Group title="Processos monitorados">
              {matches.map((p) => (
                <Item key={p.id} icon="hash"
                  primary={formatProcessNumber(p.process_number)}
                  secondary={[p.class_name, p.organ_name].filter(Boolean).join(" — ") || "—"}
                  onSelect={onClose} />
              ))}
            </Group>
          ) : (
            <div className="p-6 text-center text-zinc-500 text-[12.5px]">
              {processes.length === 0 ? "Nenhum processo cadastrado ainda." : `Nada encontrado para "${q}".`}
            </div>
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
