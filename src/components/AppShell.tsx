// @ts-nocheck
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTargets } from "../lib/useTargets";
import { useAuth } from "../lib/auth";
import { getDashboard } from "@/lib/dashboard.functions";
import { Header } from "./Header";
import { KpiRow } from "./Kpis";
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
        supabase.from("movements").select("id,occurred_at,text,urgency,process_id").order("occurred_at", { ascending: false }).limit(50),
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
  useEffect(() => {
    let active = true;
    fetchDashboard().then((res) => {
      if (active) setDashboardData(res);
    });
    return () => { active = false; };
  }, [fetchDashboard]);

  const stats = useMemo(() => {
    const NOW = Date.now();
    const novas24h = dashboardData?.stats?.totalNewMovements ?? movements.filter((m) => NOW - new Date(m.occurred_at).getTime() < 24 * 3600e3).length;
    const urgentes = movements.filter((m) => m.urgency === "critical" || m.urgency === "high").length;
    const tribunaisAtivos = tribunais.filter((t) => t.status === "ativo").length;
    const tribunaisAtrasados = tribunais.filter((t) => t.status !== "ativo").length;
    
    return {
      totalMonitorado: dashboardData?.stats?.totalProcesses ?? targetsCount.activeProcesses,
      totalAlvos: dashboardData?.stats?.totalLawyers ?? targetsCount.activeEntities,
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
              <p className="text-[13.5px] text-zinc-600 mt-0.5">
                Você tem {stats.totalMonitorado} processo{stats.totalMonitorado !== 1 ? "s" : ""} sendo monitorado{stats.totalMonitorado !== 1 ? "s" : ""}
                {stats.totalAlvos > 0 && ` vinculados a ${stats.totalAlvos} alvo${stats.totalAlvos !== 1 ? "s" : ""} ativo${stats.totalAlvos !== 1 ? "s" : ""}`}.
              </p>
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
                Monitorando: <button onClick={() => onNav("alvos")} className="text-zinc-700 hover:text-zinc-900 hover:underline font-medium">{stats.totalMonitorado} processo{stats.totalMonitorado !== 1 ? "s" : ""}</button> · {stats.totalAlvos} alvo{stats.totalAlvos !== 1 ? "s" : ""} ativo{stats.totalAlvos !== 1 ? "s" : ""}
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
