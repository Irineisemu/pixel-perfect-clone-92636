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

export function DashboardProcesses() {
  const fetchDashboard = useServerFn(getDashboard);
  const retryFn = useServerFn(triggerRediscovery);
  const syncNowFn = useServerFn(syncProcessNow);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  

  const handleSyncNow = async (processId: string) => {
    setSyncingId(processId);
    try {
      const res: any = await syncNowFn({ data: { processId } });
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
      setData(result);
    } catch (err: any) {
      console.error("[Dashboard] load error:", err);
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

  const handleRetry = async (targetId: string) => {
    setRetryingId(targetId);
    try {
      const res: any = await retryFn({ data: { targetId } });
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
  if (!data) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        Erro ao carregar painel. Recarregue a página.
      </div>
    );
  }

  const { lawyers, processes, hasRunningDiscovery, recentNewMovements = [], stats } = data;

  return (
    <div className="space-y-6">
      {hasRunningDiscovery && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-[13px] text-sky-800 flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-sky-500 animate-pulse" />
          Descoberta em andamento. Esta página atualiza sozinha a cada 5s.
        </div>
      )}

      {lawyers.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-zinc-700 mb-2 px-1">Advogados monitorados</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {lawyers.map((lw: any) => {
              const st = statusLabel(lw.discovery_status);
              const isRetrying = retryingId === lw.id;
              return (
                <div key={lw.id} className="rounded-xl border border-zinc-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-zinc-900 truncate">{lw.lawyer_name}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(lw.oab_numbers ?? []).map((oab: string) => (
                          <span
                            key={oab}
                            className="inline-flex items-center px-1.5 py-0.5 rounded border border-zinc-200 bg-zinc-50 text-[11px] text-zinc-700"
                          >
                            OAB {formatOABDisplay(oab)}
                          </span>
                        ))}
                      </div>
                      <div className="mt-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] ${st.cls}`}>
                          <span>{st.icon}</span>
                          <span>{st.text}</span>
                        </span>
                        {lw.last_discovery_at && (
                          <span className="ml-2 text-[11px] text-zinc-500">
                            · {new Date(lw.last_discovery_at).toLocaleString("pt-BR")}
                          </span>
                        )}
                      </div>
                    </div>
                    {canRetry(lw.discovery_status) && (
                      <button
                        onClick={() => handleRetry(lw.id)}
                        disabled={isRetrying}
                        className="px-3 py-1.5 rounded-md bg-zinc-900 text-white text-[12px] font-medium hover:bg-zinc-800 disabled:opacity-50 flex-shrink-0"
                      >
                        {isRetrying ? "Iniciando…" : "Buscar processos"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {recentNewMovements.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-zinc-700 mb-2 px-1 flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
            Movimentações novas
            <span className="text-zinc-500 font-normal">({recentNewMovements.length})</span>
          </h2>
          <div className="rounded-xl border border-rose-200 bg-rose-50/40 divide-y divide-rose-100">
            {recentNewMovements.map((m: any) => (
              <div key={m.id} className="p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-zinc-900">{m.movementName}</div>
                  <div className="mt-0.5 text-[11.5px] text-zinc-600">
                    <span className="font-mono">{m.processNumber}</span>
                    {m.processClass && <span> · {m.processClass}</span>}
                    {m.organName && <span className="text-zinc-500"> · {m.organName}</span>}
                  </div>
                </div>
                <div className="text-[11px] text-zinc-500 flex-shrink-0">
                  {new Date(m.occurredAt).toLocaleDateString("pt-BR")}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between mb-2 px-1">
          <h2 className="text-sm font-semibold text-zinc-700">
            Processos {processes.length > 0 && <span className="text-zinc-500 font-normal">({processes.length})</span>}
            {stats?.totalNewMovements > 0 && (
              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[11px] font-medium">
                {stats.totalNewMovements} nova{stats.totalNewMovements > 1 ? "s" : ""}
              </span>
            )}
          </h2>
        </div>

        {processes.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-10 text-center">
            <div className="text-3xl mb-2">📭</div>
            {lawyers.length === 0 ? (
              <>
                <p className="text-sm text-zinc-600 mb-3">Nenhum processo monitorado ainda.</p>
                <Link
                  to="/alvos"
                  className="inline-block px-3 py-1.5 rounded-md bg-zinc-900 text-white text-[13px] font-medium hover:bg-zinc-800"
                >
                  Adicionar processo
                </Link>
              </>
            ) : hasRunningDiscovery ? (
              <p className="text-sm text-zinc-600">
                Sincronização em andamento. Esta página atualiza sozinha.
              </p>
            ) : (
              <p className="text-sm text-zinc-600">
                Nenhum processo vinculado ainda. Vá em <Link to="/alvos" className="underline">Alvos</Link> para adicionar.
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-200 bg-white divide-y divide-zinc-100">
            {processes.map((p: any) => (
              <ProcessCard
                key={p.id + p.target.id}
                process={p}
                isSyncing={syncingId === p.id}
                onSyncNow={handleSyncNow}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default DashboardProcesses;
