// @ts-nocheck
import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTargets } from "../lib/useTargets";
import { useAuth } from "../lib/auth";
import { getDashboard } from "@/lib/dashboard.functions";
import { Header } from "./Header";
import { KpiRow } from "./Kpis";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Feed } from "./Feed";
import { DashboardProcesses } from "./DashboardProcesses";
import { TribunalStatus } from "./TribunalStatus";
import { Drawer } from "./Drawer";
import { CmdK } from "./CmdK";

export function AppShell({ route, children }: { route: "inicio" | "alvos" | "configuracoes"; children?: React.ReactNode }) {
  const navigate = useNavigate();
  const fetchDashboard = useServerFn(getDashboard);
  const { user } = useAuth();
  const greetingName = ((user?.user_metadata as any)?.name || user?.email?.split("@")[0] || "advogado(a)").split(" ")[0];
  const onNav = (id: string) => {
    if (id === "inicio") navigate({ to: "/" });
    else if (id === "alvos") navigate({ to: "/alvos" });
    else if (id === "configuracoes") navigate({ to: "/configuracoes" });
  };

  const targetsHook = useTargets();
  const targetsCount = targetsHook.counters;

  const [tribunais, setTribunais] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const [{ data: trib }, { data: mov }] = await Promise.all([
        supabase.from("tribunals").select("alias,name,status,sphere,last_synced_at"),
        supabase.from("process_movements").select("id,occurred_at,movement_name,urgency,process_id").order("occurred_at", { ascending: false }).limit(50),
      ]);
      if (!active) return;
      setTribunais((trib || []).map((t) => ({
        sigla: t.alias, nome: t.name, esfera: t.sphere,
        status: t.status === "active" ? "ativo" : t.status,
        ultimaSync: t.last_synced_at,
      })));
      setMovements(mov || []);
      setLoading(false);
    })();
  }, []);

  const [dashboardData, setDashboardData] = useState<any>(null);
  const loadDashboard = useCallback(async () => {
    try {
      const res = await fetchDashboard();
      setDashboardData(res);
    } catch (err) {
      console.error("[AppShell] dashboard error:", err);
    }
  }, [fetchDashboard]);

  useEffect(() => {
    loadDashboard();
    const it = setInterval(loadDashboard, 30000); // 30s polling
    return () => clearInterval(it);
  }, [loadDashboard]);

  const stats = useMemo(() => {
    const NOW = Date.now();
    const novas24h = dashboardData?.stats?.countProcessesWithRecentUpdates ?? movements.filter((m) => NOW - new Date(m.occurred_at).getTime() < 24 * 3600e3).length;
    const urgentes = dashboardData?.stats?.totalUrgent ?? movements.filter((m) => m.urgency === "critical" || m.urgency === "high").length;
    const tribunaisAtivos = tribunais.filter((t) => t.status === "ativo").length;
    const tribunaisAtrasados = tribunais.filter((t) => t.status !== "ativo").length;
    
    return {
      totalMonitorado: dashboardData?.stats?.totalProcesses ?? targetsCount.activeProcesses,
      totalAlvos: dashboardData?.stats?.totalAlvos ?? targetsCount.activeEntities,
      novas24h, urgentes,
      tribunaisAtivos, tribunaisTotal: tribunais.length, tribunaisAtrasados,
    };
  }, [movements, tribunais, dashboardData, targetsCount]);

  const [selected, setSelected] = useState(null);
  const [cmdkOpen, setCmdkOpen] = useState(false);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setCmdkOpen((s) => !s); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onToast = (e: any) => {
      const { kind, msg, title, description } = e.detail || {};
      const t = title || msg || "";
      if (kind === "error") toast.error(t, { description });
      else if (kind === "success" || kind === "ok") toast.success(t, { description });
      else toast(t, { description });
    };
    window.addEventListener("toast", onToast);
    return () => window.removeEventListener("toast", onToast);
  }, []);

  useEffect(() => {
    const onLocate = (e: any) => {
      if (route !== "inicio") {
        window.pendingLocateId = e.detail?.processId;
        onNav("inicio");
      }
    };
    window.addEventListener("locate-process", onLocate);
    return () => window.removeEventListener("locate-process", onLocate);
  }, [route]);

  return (
    <div className="min-h-screen bg-zinc-50/70 text-zinc-900">
      <Header route={route} onNav={onNav}
        onOpenCmdK={() => setCmdkOpen(true)}
        onOpenAlerts={() => onNav("configuracoes")} />

      {route === "inicio" ? (
        <main className="mx-auto max-w-[1440px] px-4 md:px-6 py-5 lg:py-7">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Painel</div>
              <h1 className="font-display text-2xl md:text-[28px] tracking-tight text-zinc-900">Bom dia, {greetingName}.</h1>
              <div className="text-[13.5px] text-zinc-600 mt-0.5 flex items-center gap-1 flex-wrap">
                Monitorando {stats.totalMonitorado} processo{stats.totalMonitorado !== 1 ? "s" : ""}
                {stats.totalAlvos > 0 && (
                  <>
                    <span>a partir de</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="font-bold text-zinc-900 hover:text-sky-600 transition-colors flex items-center gap-1 group">
                          {stats.totalAlvos} fonte{stats.totalAlvos !== 1 ? "s" : ""} de descoberta
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-zinc-300 group-hover:text-sky-400 transition-colors"><path d="m6 9 6 6 6-6"/></svg>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-72 p-0 overflow-hidden rounded-2xl shadow-xl border-zinc-100" align="start">
                        <div className="p-4 bg-zinc-50 border-b border-zinc-100">
                          <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Fontes de monitoramento</h3>
                        </div>
                        <div className="max-h-[280px] overflow-y-auto p-2 space-y-1 bg-white">
                          {dashboardData?.targets?.map((t: any) => (
                            <div key={t.id} className="flex items-center justify-between p-2.5 rounded-xl hover:bg-zinc-50 transition-colors">
                              <div className="min-w-0 flex-1">
                                <div className="text-[12px] font-bold text-zinc-900 truncate leading-tight">
                                  {t.lawyer_name || t.full_name || "Radar"}
                                </div>
                                {t.type === 'lawyer' && t.oab_numbers?.length > 0 && (
                                  <div className="text-[9px] text-zinc-400 font-mono truncate mt-0.5">
                                    {(t.oab_numbers as string[]).map(oab => oab.split('/')[0]).join(", ")}
                                  </div>
                                )}
                                <div className="text-[10px] text-zinc-500 font-medium uppercase tracking-tighter mt-0.5">
                                  {t.type === 'lawyer' ? 'Advogado' : t.type === 'person' ? 'Pessoa/CPF' : 'Radar'}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                                  t.discovery_status === 'running' ? 'text-sky-600 bg-sky-50' : 
                                  t.discovery_status === 'completed' ? 'text-emerald-600 bg-emerald-50' : 
                                  'text-zinc-500 bg-zinc-50'
                                }`}>
                                  {t.discovery_status === 'running' ? 'Sinc.' : t.discovery_status === 'completed' ? 'Ok' : 'Pendente'}
                                </span>
                                <div className={`w-1.5 h-1.5 rounded-full ${t.discovery_status === 'running' ? 'bg-sky-500 animate-pulse' : 'bg-emerald-500'}`} />
                              </div>
                            </div>
                          ))}
                          {/* Individual processes as a source */}
                          {(dashboardData?.pendingProcesses?.length > 0 || dashboardData?.processes?.some(p => p.target?.type === 'process')) && (
                            <div className="flex items-center justify-between p-2.5 rounded-xl hover:bg-zinc-50 transition-colors border-t border-zinc-50 mt-1">
                              <div className="min-w-0 flex-1">
                                <div className="text-[12px] font-bold text-zinc-900 truncate leading-tight">Monitoramentos Diretos</div>
                                <div className="text-[10px] text-zinc-500 font-medium uppercase tracking-tighter mt-0.5">Números CNJ individuais</div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded text-emerald-600 bg-emerald-50">Ativo</span>
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="p-3 bg-zinc-50 border-t border-zinc-100">
                          <button onClick={() => onNav("alvos")} className="w-full py-2 text-[10px] font-bold text-zinc-500 hover:text-zinc-900 uppercase tracking-widest text-center transition-colors">
                            Gerenciar todos os alvos
                          </button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </>
                )}
              </div>
            </div>
          </div>

          <KpiRow stats={stats} />

          <div className="mt-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
            <section className="min-w-0">
              <DashboardProcesses />
            </section>

            <aside className="lg:sticky lg:top-[72px] lg:self-start space-y-4">
              <TribunalStatus tribunais={tribunais} compact />
              <div className="text-[11.5px] text-zinc-500 px-1">
                Monitorando: <button onClick={() => onNav("alvos")} className="text-zinc-700 hover:text-zinc-900 hover:underline font-medium">{stats.totalMonitorado} processo{stats.totalMonitorado !== 1 ? "s" : ""}</button> · {stats.totalAlvos} fonte{stats.totalAlvos !== 1 ? "s" : ""} de busca
              </div>
            </aside>
          </div>
        </main>
      ) : (
        <main className="mx-auto max-w-[1440px] px-4 md:px-6 py-5 lg:py-7">
          {children}
        </main>
      )}

      <Drawer movimento={selected} onClose={() => setSelected(null)} />
      <CmdK open={cmdkOpen} onClose={() => setCmdkOpen(false)} />
    </div>
  );
}
export default AppShell;
