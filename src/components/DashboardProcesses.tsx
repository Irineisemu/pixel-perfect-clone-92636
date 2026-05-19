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

// Cache em memória que sobrevive a remounts (troca de aba mantém o módulo vivo)
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
  const [isPendingExpanded, setIsPendingExpanded] = useState(false);
  const [isOabExpanded, setIsOabExpanded] = useState(false);
  const [isManualExpanded, setIsManualExpanded] = useState(false);
  const [isOthersExpanded, setIsOthersExpanded] = useState(false);
  const [highlightedProcessId, setHighlightedProcessId] = useState<string | null>(null);

  const locateProcess = (processId: string) => {
    // Tenta encontrar em qual grupo o processo está para expandir a aba correta
    const p = data?.processes?.find(proc => proc.id === processId);
    if (p) {
      if (p.target?.type === 'lawyer') setIsOabExpanded(true);
      else if (p.target?.type === 'process') setIsManualExpanded(true);
      else setIsOthersExpanded(true);
    } else {
      // Fallback: expande as principais
      setIsOabExpanded(true);
      setIsManualExpanded(true);
    }
    
    setHighlightedProcessId(processId);
    
    // Pequeno delay para garantir que a aba de processos esteja aberta e renderizada
    setTimeout(() => {
      const el = document.getElementById(`process-${processId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        
        // Remove o destaque após 3 segundos
        setTimeout(() => {
          setHighlightedProcessId(null);
        }, 3000);
      }
    }, 150);
  };
  
  useEffect(() => {
    const onLocate = (e: any) => {
      if (e.detail?.processId) {
        locateProcess(e.detail.processId);
      }
    };
    window.addEventListener("locate-process", onLocate);

    // Check for pending locate from navigation
    if (window.pendingLocateId && !loading && data) {
      const id = window.pendingLocateId;
      window.pendingLocateId = null;
      // Delay so the mount transition finishes
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

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!data?.hasRunningDiscovery) return;
    const it = setInterval(load, 5000);
    return () => clearInterval(it);
  }, [data?.hasRunningDiscovery, load]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
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
      if (res?.error === "discovery_already_running") {
        toast("Descoberta já está em andamento.");
      } else if (res?.error === "rate_limit_exceeded") {
        const hrs = Math.ceil((res.retry_after_seconds ?? 0) / 3600);
        toast.error(`Aguarde ~${hrs}h para refazer a descoberta.`);
      } else if (res?.ok) {
        toast.success("Descoberta iniciada. Atualizando…");
      }
      await load();
    } catch (err: any) {
      console.error("[Dashboard] retry error:", err);
      toast.error(`Erro ao iniciar descoberta: ${err?.message ?? err}`);
    } finally {
      setRetryingId(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
        Carregando painel…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        <h3 className="font-semibold mb-1">Erro ao carregar painel</h3>
        <p className="text-rose-600 mb-4">{error || "Não foi possível recuperar os dados do servidor."}</p>
        <button 
          onClick={() => { setLoading(true); load(); }}
          className="px-4 py-2 bg-rose-600 text-white rounded-md hover:bg-rose-700 transition-colors"
        >
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
    <div className="space-y-8">
      {hasRunningDiscovery && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-[13px] text-sky-800 flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-sky-500 animate-pulse" />
          Sincronização em andamento. Esta página atualiza sozinha a cada 5s.
        </div>
      )}

      {/* 1. ALVOS & DESCOBERTAS */}
      {(targets.length > 0 || oabProcesses.length > 0 || otherProcesses.length > 0) && (
        <section className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <div>
              <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                <span className="p-1 rounded bg-zinc-900 text-white shadow-sm">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
                </span>
                1. Alvos & Descobertas
              </h2>
              <p className="text-[11px] text-zinc-500 mt-0.5 font-medium">Fontes de busca e processos encontrados automaticamente.</p>
            </div>
            <Link to="/alvos" className="text-[11px] font-bold text-zinc-900 bg-white border border-zinc-200 px-3 py-1.5 rounded-lg shadow-sm transition-all hover:bg-zinc-50">Gerenciar alvos</Link>
          </div>

          {targets.length > 0 && (
            <div className="space-y-2.5">
              {targets.map((t: any) => {
                const st = statusLabel(t.discovery_status);
                const isRetrying = retryingId === t.id;
                let title = t.lawyer_name || t.full_name || "Radar de Busca";
                let subtitle = t.type === 'lawyer' ? `OAB: ${(t.oab_numbers ?? []).map(oab => formatOABDisplay(oab)).join(", ")}` : t.type === 'person' ? "Monitoramento de Pessoa/CPF" : "Radar de Captação";

                return (
                  <div key={t.id} className="flex items-center justify-between gap-4 p-4 border border-zinc-100 bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-shadow hover:shadow-md">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[14px] text-zinc-900 truncate">{title}</span>
                        {t.target_process_links?.[0]?.count !== undefined && (
                          <span className="shrink-0 text-[10px] font-bold text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full">
                            {t.target_process_links[0].count} processos
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11px] text-zinc-500 font-medium truncate">{subtitle}</span>
                        <span className="text-zinc-200 text-[10px]">•</span>
                        <div className={`flex items-center gap-1 text-[11px] font-bold uppercase tracking-tight ${st.cls.split(' ')[1]}`}>
                          <span>{st.icon}</span>
                          <span>{st.text}</span>
                        </div>
                      </div>
                    </div>
                    {canRetry(t.discovery_status) && (
                      <button
                        onClick={() => handleRetry(t.id)}
                        disabled={isRetrying}
                        className="h-9 px-4 rounded-lg bg-zinc-900 text-white text-[12px] font-bold hover:bg-zinc-800 disabled:opacity-50 transition-colors shadow-sm"
                      >
                        {isRetrying ? "..." : "Sincronizar"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="space-y-3 pt-2">
            {oabProcesses.length > 0 && (
              <div className="overflow-hidden">
                <button
                  onClick={() => setIsOabExpanded(!isOabExpanded)}
                  className="w-full text-left py-2 px-1 flex items-center justify-between hover:bg-zinc-50/50 transition-colors border-b border-zinc-100"
                >
                  <h2 className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                    Processos encontrados (OAB)
                    <span className="text-zinc-300 font-normal">[{oabProcesses.length}]</span>
                    {countOabRecent > 0 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 text-[9px] font-black animate-pulse">
                        {countOabRecent} NOVIDADES
                      </span>
                    )}
                  </h2>
                  <div className={`transition-transform duration-200 ${isOabExpanded ? 'rotate-180' : ''}`}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
                      <path d="m6 9 6 6 6-6"/>
                    </svg>
                  </div>
                </button>
                {isOabExpanded && (
                  <div className="mt-3 space-y-3 max-h-[400px] overflow-y-auto pr-1">
                    {oabProcesses.map((p: any, idx: number) => (
                      <div key={p.id + p.target.id} id={`process-${p.id}`} className={idx !== 0 ? "border-t border-zinc-50" : ""}>
                        <ProcessCard
                          process={p}
                          isSyncing={syncingId === p.id}
                          onSyncNow={handleSyncNow}
                          isHighlighted={highlightedProcessId === p.id}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {otherProcesses.length > 0 && (
              <div className="overflow-hidden">
                <button
                  onClick={() => setIsOthersExpanded(!isOthersExpanded)}
                  className="w-full text-left py-2 px-1 flex items-center justify-between hover:bg-zinc-50/50 transition-colors border-b border-zinc-100"
                >
                  <h2 className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                    Outros processos de alvos
                    <span className="text-zinc-300 font-normal">[{otherProcesses.length}]</span>
                    {countOthersRecent > 0 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 text-[9px] font-black animate-pulse">
                        {countOthersRecent} NOVIDADES
                      </span>
                    )}
                  </h2>
                  <div className={`transition-transform duration-200 ${isOthersExpanded ? 'rotate-180' : ''}`}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
                      <path d="m6 9 6 6 6-6"/>
                    </svg>
                  </div>
                </button>
                {isOthersExpanded && (
                  <div className="mt-1 max-h-[400px] overflow-y-auto pr-1 divide-y divide-zinc-50">
                    {otherProcesses.map((p: any) => (
                      <div key={p.id + p.target.id} id={`process-${p.id}`}>
                        <ProcessCard
                          process={p}
                          isSyncing={syncingId === p.id}
                          onSyncNow={handleSyncNow}
                          isHighlighted={highlightedProcessId === p.id}
                        />
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
        <section className="space-y-4 pt-2">
          <div className="flex items-center gap-2 px-1">
            <span className="p-1 rounded bg-zinc-900 text-white shadow-sm">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </span>
            <div>
              <h2 className="text-sm font-bold text-zinc-900">2. Monitoramentos Diretos</h2>
              <p className="text-[11px] text-zinc-500 font-medium">Processos acompanhados especificamente pelo número CNJ.</p>
            </div>
          </div>

          {manualProcesses.length > 0 && (
            <div className="overflow-hidden">
              <button
                onClick={() => setIsManualExpanded(!isManualExpanded)}
                className="w-full text-left py-2 px-1 flex items-center justify-between hover:bg-zinc-50/50 transition-colors border-b border-zinc-100"
              >
                <h2 className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                  Processos individuais
                  <span className="text-zinc-300 font-normal">[{manualProcesses.length}]</span>
                  {countManualRecent > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 text-[9px] font-black animate-pulse">
                      {countManualRecent} NOVIDADES
                    </span>
                  )}
                </h2>
                <div className={`transition-transform duration-200 ${isManualExpanded ? 'rotate-180' : ''}`}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
                    <path d="m6 9 6 6 6-6"/>
                  </svg>
                </div>
              </button>
              {isManualExpanded && (
                <div className="mt-3 space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {manualProcesses.map((p: any) => (
                    <div key={p.id + p.target.id} id={`process-${p.id}`} className="border border-zinc-100 rounded-xl overflow-hidden bg-white shadow-sm">
                      <ProcessCard
                        process={p}
                        isSyncing={syncingId === p.id}
                        onSyncNow={handleSyncNow}
                        isHighlighted={highlightedProcessId === p.id}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {pendingProcesses.length > 0 && (
            <div className="overflow-hidden">
              <button
                onClick={() => setIsPendingExpanded(!isPendingExpanded)}
                className="w-full text-left py-2 px-1 flex items-center justify-between hover:bg-amber-50/50 transition-colors border-b border-amber-100"
              >
                <h2 className="text-[11px] font-bold text-amber-700 uppercase tracking-widest flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                  Processos sendo localizados
                  <span className="text-amber-300 font-normal">[{pendingProcesses.length}]</span>
                </h2>
                <div className={`transition-transform duration-200 ${isPendingExpanded ? 'rotate-180' : ''}`}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
                    <path d="m6 9 6 6 6-6"/>
                  </svg>
                </div>
              </button>
              
              {isPendingExpanded && (
                <div className="mt-3 divide-y divide-zinc-100 max-h-[300px] overflow-y-auto">
                  <div className="px-1 py-2 text-[11px] text-zinc-500 leading-relaxed italic">
                    Estes processos foram encontrados pelo sistema e estão sendo sincronizados pela primeira vez.
                  </div>
                  {pendingProcesses.map((p: any) => (
                    <div key={p.targetId} className="py-3 px-1 flex items-start justify-between gap-3 hover:bg-zinc-50 transition-colors border-b border-zinc-50">
                      <div className="min-w-0">
                        <div className="text-[13px] font-bold text-zinc-900 font-mono tracking-tight">{p.displayNumber}</div>
                        <div className="mt-0.5 text-[11px] text-zinc-500 font-medium">
                          {p.tribunal} {p.nickname && <span className="text-zinc-300 mx-1">|</span>} {p.nickname}
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[9px] font-black border border-amber-100 uppercase tracking-tighter">
                        Sincronizando
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* 3. ÚLTIMAS MOVIMENTAÇÕES */}
      {recentNewMovements.length > 0 && (
        <section className="space-y-4 pt-2">
          <div className="flex items-center gap-2 px-1">
            <span className="p-1 rounded bg-zinc-900 text-white shadow-sm">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </span>
            <div>
              <h2 className="text-sm font-bold text-zinc-900">3. Últimas Movimentações</h2>
              <p className="text-[11px] text-zinc-500 font-medium">Linha do tempo das novidades recentes.</p>
            </div>
          </div>

          <div className="overflow-hidden">
            <button
              onClick={() => setIsMovementsExpanded(!isMovementsExpanded)}
              className="w-full text-left py-2 px-1 flex items-center justify-between hover:bg-rose-50/50 transition-colors border-b border-rose-100"
            >
              <h2 className="text-[11px] font-bold text-rose-700 uppercase tracking-widest flex items-center gap-2">
                <span className={`inline-block h-2 w-2 rounded-full bg-rose-500 ${stats?.countProcessesWithRecentUpdates > 0 ? 'animate-pulse' : 'opacity-50'}`} />
                Resumo de andamentos
                {stats?.countProcessesWithRecentUpdates > 0 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 text-[9px] font-black animate-pulse">
                    {stats.countProcessesWithRecentUpdates} NOVOS
                  </span>
                )}
              </h2>
              <div className={`transition-transform duration-200 ${isMovementsExpanded ? 'rotate-180' : ''}`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-rose-400">
                  <path d="m6 9 6 6 6-6"/>
                </svg>
              </div>
            </button>
            
            {isMovementsExpanded && (
              <div className="mt-3 divide-y divide-zinc-100 max-h-[400px] overflow-y-auto">
                {recentNewMovements.map((m: any) => (
                  <button 
                    key={m.id} 
                    onClick={() => locateProcess(m.processId)}
                    className="w-full text-left py-3 px-1 flex items-start justify-between gap-3 hover:bg-rose-50/50 transition-colors group border-b border-zinc-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-bold text-zinc-900 leading-tight group-hover:text-rose-700 transition-colors flex items-center gap-2">
                        {m.movementName}
                        {m.isRecent && <span className="px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-600 text-[9px] font-black">NOVO</span>}
                        {m.urgency && m.urgency !== 'info' && (
                          <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter ${
                            m.urgency === 'critical' ? 'bg-red-50 text-red-600' : 
                            m.urgency === 'high' ? 'bg-orange-50 text-orange-600' : 'bg-amber-50 text-amber-600'
                          }`}>
                            {m.urgency === 'critical' ? 'URGENTE' : m.urgency === 'high' ? 'ALTA' : 'MÉDIA'}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-[11px] text-zinc-500 font-medium flex flex-wrap items-center gap-x-2">
                        <span className="font-mono text-zinc-900 font-bold tracking-tighter">{m.processNumber}</span>
                        <span className="text-zinc-200 text-[8px]">|</span>
                        <span className="truncate">{m.processClass}</span>
                        {m.organName && (
                          <>
                            <span className="text-zinc-200 text-[8px]">|</span>
                            <span className="text-zinc-400 italic truncate max-w-[150px]">{m.organName}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-[10px] text-zinc-400 font-bold whitespace-nowrap bg-zinc-50 px-2 py-1 rounded-md border border-zinc-100 flex-shrink-0">
                      {new Date(m.occurredAt).toLocaleDateString("pt-BR")}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {processes.length === 0 && targets.length === 0 && (
        <section className="bg-white rounded-2xl border border-zinc-100 p-12 text-center shadow-sm">
          <div className="text-4xl mb-4">📭</div>
          <h3 className="text-lg font-bold text-zinc-900 mb-2">Tudo pronto para começar</h3>
          <p className="text-sm text-zinc-500 mb-6 max-w-sm mx-auto">Adicione seus primeiros processos ou alvos para iniciar o monitoramento automático.</p>
          <Link to="/alvos" className="inline-block px-6 py-2.5 rounded-xl bg-zinc-900 text-white text-[14px] font-bold hover:bg-zinc-800 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5">
            Começar monitoramento
          </Link>
        </section>
      )}
    </div>
  );
}

export default DashboardProcesses;
