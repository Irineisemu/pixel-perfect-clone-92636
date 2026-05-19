// @ts-nocheck
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { getDashboard } from "@/lib/dashboard.functions";
import { triggerRediscovery } from "@/lib/lawyer.functions";
import { syncProcessNow } from "@/lib/process.functions";
import { formatOABDisplay } from "@/types/targets";
import { ProcessCard } from "@/components/processes/ProcessCard";

function statusLabel(s: string | null) {
  switch (s) {
    case "pending":
      return { text: "Aguardando descoberta", icon: "⏳", cls: "bg-amber-50 text-amber-700 border-amber-200" };
    case "running":
      return { text: "Buscando processos…", icon: "🔄", cls: "bg-sky-50 text-sky-700 border-sky-200" };
    case "completed":
      return { text: "Descoberta concluída", icon: "✓", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    case "partial":
      return { text: "Concluída com alertas", icon: "⚠", cls: "bg-amber-50 text-amber-700 border-amber-200" };
    case "failed":
      return { text: "Descoberta falhou", icon: "✗", cls: "bg-rose-50 text-rose-700 border-rose-200" };
    default:
      return { text: "Sem descoberta", icon: "•", cls: "bg-zinc-50 text-zinc-700 border-zinc-200" };
  }
}

function canRetry(s: string | null) {
  return s !== "running";
}

// Cache em memória que sobrevive a remounts
let cachedDashboard: any = null;

export function DashboardProcesses() {
  const fetchDashboard = useServerFn(getDashboard);
  const retryFn = useServerFn(triggerRediscovery);
  const syncNowFn = useServerFn(syncProcessNow);

  const [data, setData] = useState<any>(cachedDashboard);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!cachedDashboard);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [isMovementsExpanded, setIsMovementsExpanded] = useState(false);
  
  const [isOabExpanded, setIsOabExpanded] = useState(false);
  const [isManualExpanded, setIsManualExpanded] = useState(false);
  const [isOthersExpanded, setIsOthersExpanded] = useState(false);
  const [highlightedProcessId, setHighlightedProcessId] = useState<string | null>(null);

  const locateProcess = (processId: string) => {
    const p = data?.processes?.find(proc => proc.id === processId);
    if (p) {
      if (p.target?.type === 'lawyer') setIsOabExpanded(true);
      else if (p.target?.type === 'process') setIsManualExpanded(true);
      else setIsOthersExpanded(true);
    } else {
      setIsOabExpanded(true);
      setIsManualExpanded(true);
    }
    
    setHighlightedProcessId(processId);
    
    setTimeout(() => {
      const el = document.getElementById(`process-${processId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => setHighlightedProcessId(null), 3000);
      }
    }, 150);
  };
  
  useEffect(() => {
    const onLocate = (e: any) => {
      if (e.detail?.processId) locateProcess(e.detail.processId);
    };
    window.addEventListener("locate-process", onLocate);

    if (window.pendingLocateId && !loading && data) {
      const id = window.pendingLocateId;
      window.pendingLocateId = null;
      setTimeout(() => locateProcess(id), 500);
    }

    return () => window.removeEventListener("locate-process", onLocate);
  }, [loading, data]);

  const handleSyncNow = async (processId: string) => {
    setSyncingId(processId);
    try {
      const res: any = await syncNowFn({ processId });
      if (res?.ok) {
        toast.success("Sincronização concluída.");
        await load();
      } else {
        toast.error(`Falha: ${res?.error ?? "desconhecida"}`);
      }
    } catch (err: any) {
      toast.error(`Erro: ${err?.message ?? err}`);
    } finally {
      setSyncingId(null);
    }
  };

  const load = useCallback(async () => {
    try {
      const result = await fetchDashboard();
      cachedDashboard = result;
      setData(result);
      setError(null);
    } catch (err: any) {
      console.error("[Dashboard] load error:", err);
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }, [fetchDashboard]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!data?.hasRunningDiscovery) return;
    const it = setInterval(load, 5000);
    return () => clearInterval(it);
  }, [data?.hasRunningDiscovery, load]);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    const onFocus = () => load();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const handleRetry = async (targetId: string) => {
    setRetryingId(targetId);
    try {
      const res: any = await retryFn({ targetId });
      if (res?.ok) toast.success("Sincronização iniciada.");
      await load();
    } catch (err: any) {
      toast.error(`Erro: ${err?.message ?? err}`);
    } finally {
      setRetryingId(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-zinc-100 bg-white p-12 text-center text-sm text-zinc-500 font-normal">
        Carregando painel…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-rose-100 bg-rose-50/30 p-8 text-sm text-rose-700">
        <h3 className="font-semibold mb-2">Erro ao carregar painel</h3>
        <p className="mb-4 text-rose-600/80">{error || "Não foi possível recuperar os dados."}</p>
        <button onClick={() => { setLoading(true); load(); }} className="px-4 py-2 bg-rose-600 text-white rounded-lg font-semibold">
          Tentar novamente
        </button>
      </div>
    );
  }

  const { targets = [], processes, pendingProcesses = [], hasRunningDiscovery, recentNewMovements = [], stats } = data;
  const oabProcesses = processes.filter((p: any) => p.target?.type === 'lawyer');
  const manualProcesses = processes.filter((p: any) => p.target?.type === 'process');
  const otherProcesses = processes.filter((p: any) => p.target?.type !== 'lawyer' && p.target?.type !== 'process');

  const yesterday = new Date();
  yesterday.setHours(yesterday.getHours() - 24);

  const countOabRecent = oabProcesses.filter((p: any) => p.lastMovement && new Date(p.lastMovement.occurredAt) >= yesterday).length;
  const countManualRecent = manualProcesses.filter((p: any) => p.lastMovement && new Date(p.lastMovement.occurredAt) >= yesterday).length;
  const countOthersRecent = otherProcesses.filter((p: any) => p.lastMovement && new Date(p.lastMovement.occurredAt) >= yesterday).length;

  return (
    <div className="space-y-6 pb-10">
      {hasRunningDiscovery && (
        <div className="rounded-xl border border-sky-100 bg-sky-50/50 px-4 py-3 text-[12px] text-sky-700 font-semibold flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-sky-500 animate-pulse" />
          Sincronização em andamento…
        </div>
      )}

      {/* 1. ALVOS & DESCOBERTAS */}
      {(targets.length > 0 || oabProcesses.length > 0 || otherProcesses.length > 0) && (
        <section className="bg-zinc-50/50 border border-zinc-100 rounded-[32px] p-5 md:p-8 space-y-6">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-zinc-900 text-white flex items-center justify-center text-xs font-bold shadow-sm">1</span>
              <div>
                <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-tight">Alvos & Descobertas</h2>
                <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-widest mt-0.5">Fontes e processos automáticos</p>
              </div>
            </div>
            <Link to="/alvos" className="text-[11px] font-bold text-zinc-900 bg-white border border-zinc-200 px-3 py-1.5 rounded-lg shadow-sm hover:bg-zinc-50 transition-all">GERENCIAR</Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {targets.map((t: any) => {
              const st = statusLabel(t.discovery_status);
              const isRetrying = retryingId === t.id;
              const subtitle = t.type === 'lawyer' ? `OAB: ${(t.oab_numbers ?? []).map(oab => formatOABDisplay(oab)).join(", ")}` : t.type === 'person' ? "Pessoa/CPF" : "Radar";

              return (
                <div key={t.id} className="p-4 border border-zinc-100 bg-white rounded-2xl shadow-[0_2px_4px_rgba(0,0,0,0.02)] flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[14px] text-zinc-900 truncate">{t.lawyer_name || t.full_name || "Radar"}</span>
                      {t.target_process_links?.[0]?.count !== undefined && (
                        <span className="text-[9px] font-bold text-zinc-500 bg-zinc-50 px-1.5 py-0.5 rounded border border-zinc-100">{t.target_process_links[0].count}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[11px] text-zinc-500 font-medium truncate">{subtitle}</span>
                      <span className={`text-[10px] font-bold uppercase tracking-tighter ${st.cls.split(' ')[1]}`}>{st.text}</span>
                    </div>
                  </div>
                  <button onClick={() => handleRetry(t.id)} disabled={isRetrying} className="h-8 px-3 rounded-lg bg-zinc-900 text-white text-[11px] font-bold hover:bg-zinc-800 disabled:opacity-50">
                    {isRetrying ? "..." : "SYNC"}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="space-y-1">
            {oabProcesses.length > 0 && (
              <div className="overflow-hidden bg-white border border-zinc-100 rounded-2xl px-4 shadow-sm">
                <button onClick={() => setIsOabExpanded(!isOabExpanded)} className={`w-full text-left py-4 flex items-center justify-between group ${isOabExpanded ? 'border-b border-zinc-50' : ''}`}>
                  <h2 className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2 group-hover:text-zinc-700 transition-colors">
                    Processos encontrados (OAB)
                    <span className="text-zinc-300">[{oabProcesses.length}]</span>
                    {countOabRecent > 0 && <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 text-[9px] font-bold">{countOabRecent} NOVOS</span>}
                  </h2>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" className={`text-zinc-200 transition-transform ${isOabExpanded ? 'rotate-180' : ''}`}><path d="m6 9 6 6 6-6"/></svg>
                </button>
                {isOabExpanded && (
                  <div className="mt-2 divide-y divide-zinc-50 max-h-[400px] overflow-y-auto">
                    {oabProcesses.map((p: any) => (
                      <div key={p.id + p.target.id} id={`process-${p.id}`} className="py-1">
                        <ProcessCard process={p} isSyncing={syncingId === p.id} onSyncNow={handleSyncNow} isHighlighted={highlightedProcessId === p.id} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {otherProcesses.length > 0 && (
              <div className="overflow-hidden bg-white border border-zinc-100 rounded-2xl px-4 shadow-sm">
                <button onClick={() => setIsOthersExpanded(!isOthersExpanded)} className={`w-full text-left py-4 flex items-center justify-between group ${isOthersExpanded ? 'border-b border-zinc-50' : ''}`}>
                  <h2 className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2 group-hover:text-zinc-700 transition-colors">
                    Outros de alvos
                    <span className="text-zinc-300">[{otherProcesses.length}]</span>
                  </h2>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" className={`text-zinc-200 transition-transform ${isOthersExpanded ? 'rotate-180' : ''}`}><path d="m6 9 6 6 6-6"/></svg>
                </button>
                {isOthersExpanded && (
                  <div className="mt-2 divide-y divide-zinc-50 max-h-[400px] overflow-y-auto">
                    {otherProcesses.map((p: any) => (
                      <div key={p.id + p.target.id} id={`process-${p.id}`} className="py-1">
                        <ProcessCard process={p} isSyncing={syncingId === p.id} onSyncNow={handleSyncNow} isHighlighted={highlightedProcessId === p.id} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* 2. MONITORAMENTOS DIRETOS */}
      {(manualProcesses.length > 0 || pendingProcesses.length > 0) && (
        <section className="bg-zinc-50/50 border border-zinc-100 rounded-[32px] p-5 md:p-8 space-y-6">
          <div className="flex items-center gap-3 px-2">
            <span className="w-8 h-8 rounded-lg bg-zinc-900 text-white flex items-center justify-center text-xs font-bold shadow-sm">2</span>
            <div>
              <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-tight">Monitoramentos Diretos</h2>
              <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-widest mt-0.5">Processos por número CNJ</p>
            </div>
          </div>

          <div className="space-y-1">
            {manualProcesses.length > 0 && (
              <div className="overflow-hidden bg-white border border-zinc-100 rounded-2xl px-4 shadow-sm">
                <button onClick={() => setIsManualExpanded(!isManualExpanded)} className={`w-full text-left py-4 flex items-center justify-between group ${isManualExpanded ? 'border-b border-zinc-50' : ''}`}>
                  <h2 className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2 group-hover:text-zinc-700 transition-colors">
                    Processos individuais
                    <span className="text-zinc-300">[{manualProcesses.length}]</span>
                    {countManualRecent > 0 && <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 text-[9px] font-bold">{countManualRecent} NOVOS</span>}
                  </h2>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" className={`text-zinc-200 transition-transform ${isManualExpanded ? 'rotate-180' : ''}`}><path d="m6 9 6 6 6-6"/></svg>
                </button>
                {isManualExpanded && (
                  <div className="mt-2 divide-y divide-zinc-50 max-h-[500px] overflow-y-auto">
                    {manualProcesses.map((p: any) => (
                      <div key={p.id + p.target.id} id={`process-${p.id}`} className="py-1">
                        <ProcessCard process={p} isSyncing={syncingId === p.id} onSyncNow={handleSyncNow} isHighlighted={highlightedProcessId === p.id} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* 3. ÚLTIMAS MOVIMENTAÇÕES */}
      {recentNewMovements.length > 0 && (
        <section className="bg-zinc-50/50 border border-zinc-100 rounded-[32px] p-5 md:p-8 space-y-6">
          <div className="flex items-center gap-3 px-2">
            <span className="w-8 h-8 rounded-lg bg-zinc-900 text-white flex items-center justify-center text-xs font-bold shadow-sm">3</span>
            <div>
              <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-tight">Últimas Movimentações</h2>
              <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-widest mt-0.5">Andamentos recentes detectados</p>
            </div>
          </div>

          <div className="overflow-hidden">
            <button onClick={() => setIsMovementsExpanded(!isMovementsExpanded)} className="w-full text-left py-3 px-1 flex items-center justify-between border-b border-rose-100 group">
              <h2 className="text-[11px] font-bold text-rose-600 uppercase tracking-widest flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full bg-rose-500 ${stats?.countProcessesWithRecentUpdates > 0 ? 'animate-pulse' : 'opacity-50'}`} />
                Resumo de andamentos
                {stats?.countProcessesWithRecentUpdates > 0 && <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 text-[9px] font-bold">{stats.countProcessesWithRecentUpdates} NOVOS</span>}
              </h2>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" className={`text-rose-200 transition-transform ${isMovementsExpanded ? 'rotate-180' : ''}`}><path d="m6 9 6 6 6-6"/></svg>
            </button>
            {isMovementsExpanded && (
              <div className="mt-2 divide-y divide-zinc-50 max-h-[400px] overflow-y-auto">
                {recentNewMovements.map((m: any) => (
                  <button key={m.id} onClick={() => locateProcess(m.processId)} className="w-full text-left py-3 px-1 flex items-start justify-between gap-4 hover:bg-zinc-50 transition-colors group">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-bold text-zinc-900 leading-tight group-hover:text-zinc-600">
                        {m.movementName}
                        {m.isRecent && <span className="ml-2 px-1.5 py-0.5 rounded bg-rose-100 text-rose-600 text-[9px] font-bold">NOVO</span>}
                      </div>
                      <div className="mt-1 text-[11px] text-zinc-500 font-medium uppercase tracking-tight flex items-center gap-2">
                        <span className="font-mono text-zinc-900 tracking-tighter">{m.processNumber}</span>
                        <span className="text-zinc-200">•</span>
                        <span className="truncate">{m.processClass}</span>
                      </div>
                    </div>
                    <div className="text-[10px] font-semibold text-zinc-600 bg-zinc-50 px-2 py-1 rounded border border-zinc-100">{new Date(m.occurredAt).toLocaleDateString("pt-BR")}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

export default DashboardProcesses;
