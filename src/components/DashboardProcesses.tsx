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

  // Atualiza em background quando o usuário volta para a aba do navegador
  // ou foca a janela — sem mostrar o skeleton de carregamento.
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
    <div className="space-y-6">
      {hasRunningDiscovery && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-[13px] text-sky-800 flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-sky-500 animate-pulse" />
          Sincronização em andamento. Esta página atualiza sozinha a cada 5s.
        </div>
      )}

      {targets.length > 0 && (
        <section className="bg-zinc-50/50 rounded-xl border border-zinc-100 p-4 mb-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                <span className="p-1 rounded bg-zinc-900 text-white">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
                </span>
                Alvos de Descoberta
              </h2>
              <p className="text-[11px] text-zinc-500 mt-0.5">Fontes usadas para encontrar novos processos automaticamente (OABs, CPFs e Radares).</p>
            </div>
            <Link to="/alvos" className="text-[11px] font-medium text-zinc-600 hover:text-zinc-900 bg-white border border-zinc-200 px-2 py-1 rounded shadow-sm transition-all hover:shadow">Gerenciar alvos</Link>
          </div>
          <div className="max-h-[300px] overflow-y-auto pr-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-1">
              {targets.map((t: any) => {
                const st = statusLabel(t.discovery_status);
                const isRetrying = retryingId === t.id;
                
                let title = t.lawyer_name || t.full_name || "Radar de Busca";
                let subtitle = "";
                
                if (t.type === 'lawyer') {
                  subtitle = `OAB: ${(t.oab_numbers ?? []).map(oab => formatOABDisplay(oab)).join(", ")}`;
                } else if (t.type === 'person') {
                  subtitle = "Monitoramento de Pessoa/CPF";
                } else if (t.type === 'radar') {
                  subtitle = "Radar de Captação";
                }

                return (
                  <div key={t.id} className="rounded-xl border border-zinc-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="font-medium text-zinc-900 truncate">{title}</div>
                          {t.target_process_links?.[0]?.count !== undefined && (
                            <span className="shrink-0 text-[10px] font-medium text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded-full">
                              {t.target_process_links[0].count} processos
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded border border-zinc-200 bg-zinc-50 text-[11px] text-zinc-700">
                            {subtitle}
                          </span>
                        </div>
                        <div className="mt-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] ${st.cls}`}>
                            <span>{st.icon}</span>
                            <span>{st.text}</span>
                          </span>
                          {t.last_discovery_at && (
                            <span className="ml-2 text-[11px] text-zinc-500">
                              · {new Date(t.last_discovery_at).toLocaleString("pt-BR")}
                            </span>
                          )}
                        </div>
                      </div>
                      {canRetry(t.discovery_status) && (
                        <button
                          onClick={() => handleRetry(t.id)}
                          disabled={isRetrying}
                          className="px-3 py-1.5 rounded-md bg-zinc-900 text-white text-[12px] font-medium hover:bg-zinc-800 disabled:opacity-50 flex-shrink-0"
                        >
                          {isRetrying ? "Iniciando…" : "Sincronizar"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {recentNewMovements.length > 0 && (
        <section className="bg-rose-50/30 rounded-xl border border-rose-100 overflow-hidden transition-all">
          <button
            onClick={() => setIsMovementsExpanded(!isMovementsExpanded)}
            className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-rose-50/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className={`inline-block h-2 w-2 rounded-full bg-rose-500 ${stats?.countProcessesWithRecentUpdates > 0 ? 'animate-pulse' : 'opacity-50'}`} />
              <h2 className="text-sm font-semibold text-zinc-700">
                Últimas movimentações detectadas
                {stats?.countProcessesWithRecentUpdates > 0 && (
                  <span className="ml-2 text-rose-600 font-bold bg-rose-100 px-1.5 py-0.5 rounded text-xs animate-pulse">
                    {stats.countProcessesWithRecentUpdates} novas
                  </span>
                )}
              </h2>
              <span className="text-[11px] text-rose-500 font-normal ml-2 hidden sm:inline">
                (Aqui estão as últimas movimentações dos seus processos)
              </span>
            </div>
            <div className={`transition-transform duration-200 ${isMovementsExpanded ? 'rotate-180' : ''}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
                <path d="m6 9 6 6 6-6"/>
              </svg>
            </div>
          </button>
          
          {isMovementsExpanded && (
            <div className="border-t border-rose-100 bg-white/50 divide-y divide-rose-100 max-h-[400px] overflow-y-auto">
              <div className="px-4 py-2 bg-rose-50/50 text-[11px] text-rose-700 leading-relaxed border-b border-rose-100">
                Estas são as últimas atualizações de cada processo monitorado. 
                {stats?.countProcessesWithRecentUpdates > 0 && ` Detectamos ${stats.countProcessesWithRecentUpdates} andamento(s) nas últimas 24h.`}
              </div>
              {recentNewMovements.map((m: any) => (
                <button 
                  key={m.id} 
                  onClick={() => locateProcess(m.processId)}
                  className="w-full text-left p-3 px-4 flex items-start justify-between gap-3 hover:bg-rose-50 transition-colors group"
                >
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-zinc-900 leading-snug group-hover:text-rose-700 transition-colors flex items-center gap-2">
                      {m.movementName}
                      {m.isRecent && (
                        <span className="px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-600 text-[10px] font-bold animate-pulse">NOVO</span>
                      )}
                      {m.urgency && m.urgency !== 'info' && (
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          m.urgency === 'critical' ? 'bg-red-100 text-red-600' : 
                          m.urgency === 'high' ? 'bg-orange-100 text-orange-600' :
                          'bg-amber-100 text-amber-600'
                        }`}>
                          {m.urgency === 'critical' ? 'URGENTE' : m.urgency === 'high' ? 'ALTA PRIORIDADE' : 'MÉDIA'}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-[11.5px] text-zinc-600 flex flex-wrap items-center gap-x-2">
                      <span className="font-mono text-zinc-900 font-medium">{m.processNumber}</span>
                      <span className="text-zinc-300">|</span>
                      <span>{m.processClass}</span>
                      {m.organName && (
                        <>
                          <span className="text-zinc-300">|</span>
                          <span className="text-zinc-500">{m.organName}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <div className="text-[11px] text-zinc-500 font-medium whitespace-nowrap bg-zinc-100 px-1.5 py-0.5 rounded">
                      {new Date(m.occurredAt).toLocaleDateString("pt-BR")}
                    </div>
                    <span className="text-[10px] text-rose-500 font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                      Ver processo
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      )}


      {processes.length === 0 && (
        <section className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
          <div className="p-10 text-center">
            <div className="text-3xl mb-2">📭</div>
            {targets.length === 0 ? (
              <>
                <p className="text-sm text-zinc-600 mb-3">Nenhum processo ou alvo monitorado ainda.</p>
                <Link
                  to="/alvos"
                  className="inline-block px-3 py-1.5 rounded-md bg-zinc-900 text-white text-[13px] font-medium hover:bg-zinc-800"
                >
                  Adicionar alvo ou processo
                </Link>
              </>
            ) : hasRunningDiscovery ? (
              <p className="text-sm text-zinc-600">
                Sincronização em andamento. Esta página atualiza sozinha.
              </p>
            ) : (
              <p className="text-sm text-zinc-600">
                Nenhum processo vinculado ainda. Vá em <Link to="/alvos" className="underline">Alvos</Link> para adicionar mais fontes.
              </p>
            )}
          </div>
        </section>
      )}

      {(manualProcesses.length > 0 || oabProcesses.length > 0 || otherProcesses.length > 0) && (
        <div className="pt-2 px-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="p-1 rounded bg-zinc-200 text-zinc-700">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </span>
            <div>
              <h2 className="text-sm font-bold text-zinc-900">Monitoramentos Diretos</h2>
              <p className="text-[11px] text-zinc-500">Processos específicos sendo acompanhados pelo número CNJ.</p>
            </div>
          </div>
        </div>
      )}

      {manualProcesses.length > 0 && (
        <section className="bg-white rounded-xl border border-zinc-200 overflow-hidden transition-all">
          <button
            onClick={() => setIsManualExpanded(!isManualExpanded)}
            className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-zinc-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-zinc-700">
                Processos individuais
                <span className="ml-2 text-zinc-500 font-normal bg-zinc-100 px-1.5 py-0.5 rounded text-xs">
                  {manualProcesses.length}
                </span>
                {countManualRecent > 0 && (
                  <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[11px] font-medium animate-pulse">
                    {countManualRecent} com novidades
                  </span>
                )}
              </h2>
            </div>
            <div className={`transition-transform duration-200 ${isManualExpanded ? 'rotate-180' : ''}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
                <path d="m6 9 6 6 6-6"/>
              </svg>
            </div>
          </button>
          {isManualExpanded && (
            <div className="border-t border-zinc-100 max-h-[500px] overflow-y-auto divide-y divide-zinc-100">
              {manualProcesses.map((p: any) => (
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
        </section>
      )}

      {oabProcesses.length > 0 && (
        <section className="bg-white rounded-xl border border-zinc-200 overflow-hidden transition-all">
          <button
            onClick={() => setIsOabExpanded(!isOabExpanded)}
            className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-zinc-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-zinc-700">
                Processos da OAB
                <span className="ml-2 text-zinc-500 font-normal bg-zinc-100 px-1.5 py-0.5 rounded text-xs">
                  {oabProcesses.length}
                </span>
                {countOabRecent > 0 && (
                  <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[11px] font-medium animate-pulse">
                    {countOabRecent} com novidades
                  </span>
                )}
              </h2>
            </div>
            <div className={`transition-transform duration-200 ${isOabExpanded ? 'rotate-180' : ''}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
                <path d="m6 9 6 6 6-6"/>
              </svg>
            </div>
          </button>
          {isOabExpanded && (
            <div className="border-t border-zinc-100 max-h-[500px] overflow-y-auto divide-y divide-zinc-100">
              {oabProcesses.map((p: any) => (
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
        </section>
      )}

      {otherProcesses.length > 0 && (
        <section className="bg-white rounded-xl border border-zinc-200 overflow-hidden transition-all">
          <button
            onClick={() => setIsOthersExpanded(!isOthersExpanded)}
            className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-zinc-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-zinc-700">
                Processos de outros alvos
                <span className="ml-2 text-zinc-500 font-normal bg-zinc-100 px-1.5 py-0.5 rounded text-xs">
                  {otherProcesses.length}
                </span>
                {countOthersRecent > 0 && (
                  <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[11px] font-medium animate-pulse">
                    {countOthersRecent} com novidades
                  </span>
                )}
              </h2>
            </div>
            <div className={`transition-transform duration-200 ${isOthersExpanded ? 'rotate-180' : ''}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
                <path d="m6 9 6 6 6-6"/>
              </svg>
            </div>
          </button>
          {isOthersExpanded && (
            <div className="border-t border-zinc-100 max-h-[500px] overflow-y-auto divide-y divide-zinc-100">
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
        </section>
      )}

      {pendingProcesses.length > 0 && (
        <section className="bg-amber-50/30 rounded-xl border border-amber-100 overflow-hidden transition-all">
          <button
            onClick={() => setIsPendingExpanded(!isPendingExpanded)}
            className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-amber-50/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              <h2 className="text-sm font-semibold text-zinc-700">
                Processos sendo localizados
                <span className="ml-2 text-amber-600 font-bold bg-amber-100 px-1.5 py-0.5 rounded text-xs">
                  {pendingProcesses.length}
                </span>
              </h2>
              <span className="text-[11px] text-amber-500 font-normal ml-2 hidden sm:inline">
                (Novos processos em fila de busca inicial)
              </span>
            </div>
            <div className={`transition-transform duration-200 ${isPendingExpanded ? 'rotate-180' : ''}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
                <path d="m6 9 6 6 6-6"/>
              </svg>
            </div>
          </button>
          
          {isPendingExpanded && (
            <div className="border-t border-amber-100 bg-white/50 divide-y divide-amber-100 max-h-[300px] overflow-y-auto">
              <div className="px-4 py-2 bg-amber-50/50 text-[11px] text-amber-700 leading-relaxed border-b border-amber-100">
                Estes processos foram encontrados pelo sistema e estão tendo seus dados e movimentações sincronizados pela primeira vez. 
                Isso pode levar alguns minutos.
              </div>
              {pendingProcesses.map((p: any) => (
                <div key={p.targetId} className="p-3 px-4 flex items-start justify-between gap-3 hover:bg-amber-50/30 transition-colors">
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-zinc-900 font-mono">{p.displayNumber}</div>
                    <div className="mt-1 text-[11.5px] text-zinc-600">
                      {p.tribunal}
                      {p.nickname && <span className="text-zinc-400"> · {p.nickname}</span>}
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-700 text-[11px] flex-shrink-0 font-medium">
                    ⏳ Sincronizando
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>

  );
}

export default DashboardProcesses;
