import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { supabase } from "@/integrations/supabase/client";
import {
  getDiscoveryStatus,
  triggerRediscovery,
} from "@/lib/lawyer.functions";
import { formatOABDisplay } from "@/types/targets";

export const Route = createFileRoute("/_authenticated/alvos/$targetId/descoberta")({
  component: () => (
    <AppShell route="alvos">
      <DiscoveryPage />
    </AppShell>
  ),
});

type RunStatus = "running" | "completed" | "failed" | "partial";

interface DiscoveryRun {
  id: string;
  target_id: string;
  status: RunStatus;
  total_found: number;
  by_oab: Record<string, number>;
  by_tribunal: Record<string, number>;
  errors: Record<string, string> | null;
  started_at: string;
  finished_at: string | null;
  triggered_by: string;
}

interface TargetSummary {
  id: string;
  lawyer_name: string | null;
  oab_numbers: string[] | null;
  discovery_status: string | null;
  last_discovery_at: string | null;
}

function StatusBadge({ status }: { status: RunStatus | string }) {
  const map: Record<string, { label: string; cls: string; icon: string }> = {
    running: {
      label: "Em andamento",
      cls: "bg-amber-50 text-amber-700 border-amber-200",
      icon: "loader",
    },
    completed: {
      label: "Concluída",
      cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
      icon: "check-circle-2",
    },
    partial: {
      label: "Parcial",
      cls: "bg-orange-50 text-orange-700 border-orange-200",
      icon: "alert-triangle",
    },
    failed: {
      label: "Falhou",
      cls: "bg-red-50 text-red-700 border-red-200",
      icon: "alert-octagon",
    },
  };
  const m = map[status] || map.running;
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11.5px] font-medium " +
        m.cls
      }
    >
      <Icon
        name={m.icon}
        className={"h-3 w-3 " + (status === "running" ? "animate-spin" : "")}
      />
      {m.label}
    </span>
  );
}

function formatElapsed(startIso: string, endIso?: string | null): string {
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const sec = Math.max(0, Math.floor((end - start) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function DiscoveryPage() {
  const { targetId } = Route.useParams();
  
  const fetchStatus = useServerFn(getDiscoveryStatus);
  const rediscover = useServerFn(triggerRediscovery);

  const [target, setTarget] = useState<TargetSummary | null>(null);
  const [run, setRun] = useState<DiscoveryRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rediscoverState, setRediscoverState] = useState<{
    loading: boolean;
    msg: string | null;
    kind: "ok" | "error" | null;
  }>({ loading: false, msg: null, kind: null });
  const [tick, setTick] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const res = (await fetchStatus({ data: { targetId } })) as any;
      setTarget(res.target);
      setRun(res.run);
      setError(null);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [fetchStatus, targetId]);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Realtime subscription on discovery_runs for this target
  useEffect(() => {
    const channel = supabase
      .channel(`discovery:${targetId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "discovery_runs",
          filter: `target_id=eq.${targetId}`,
        },
        (payload: any) => {
          const next = (payload.new ?? payload.old) as DiscoveryRun;
          if (!next) return;
          setRun((prev) => {
            // Prefer the freshest event for the latest run
            if (!prev || new Date(next.started_at) >= new Date(prev.started_at)) {
              return next;
            }
            return prev;
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [targetId]);

  // Tick every second to update elapsed time when running
  useEffect(() => {
    if (run?.status !== "running") return;
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [run?.status]);

  // Poll fallback every 10s when running, plus a final refresh once it ends
  useEffect(() => {
    if (run?.status !== "running") return;
    const id = setInterval(() => refresh(), 10_000);
    return () => clearInterval(id);
  }, [run?.status, refresh]);

  const onRediscover = async () => {
    setRediscoverState({ loading: true, msg: null, kind: null });
    try {
      const res = (await rediscover({ data: { targetId } })) as any;
      if (res?.error === "rate_limit_exceeded") {
        const hrs = Math.ceil(res.retry_after_seconds / 3600);
        setRediscoverState({
          loading: false,
          msg: `Aguarde ${hrs}h antes de redescobrir novamente.`,
          kind: "error",
        });
      } else if (res?.error === "discovery_already_running") {
        setRediscoverState({
          loading: false,
          msg: "Já existe uma descoberta em andamento.",
          kind: "error",
        });
      } else if (res?.ok) {
        setRediscoverState({
          loading: false,
          msg: "Nova descoberta iniciada.",
          kind: "ok",
        });
        refresh();
      } else {
        setRediscoverState({
          loading: false,
          msg: "Não foi possível iniciar a descoberta.",
          kind: "error",
        });
      }
    } catch (e: any) {
      setRediscoverState({
        loading: false,
        msg: String(e?.message || e),
        kind: "error",
      });
    }
  };

  if (loading) {
    return (
      <div className="grid place-items-center py-20 text-zinc-500 text-[13px] gap-2">
        <Icon name="loader" className="h-5 w-5 animate-spin" />
        Carregando descoberta…
      </div>
    );
  }

  if (error || !target) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-[13px] text-red-700">
        <div className="font-medium mb-1">Não foi possível carregar este alvo.</div>
        <div className="text-red-600/80">{error || "Alvo não encontrado."}</div>
        <Link
          to="/alvos"
          className="mt-3 inline-flex items-center gap-1 text-red-700 hover:underline"
        >
          <Icon name="chevron-left" className="h-3.5 w-3.5" /> Voltar para Alvos
        </Link>
      </div>
    );
  }

  const oabs = target.oab_numbers || [];
  const oabCount = oabs.length;
  const completedOabs = run
    ? oabs.filter((o) => (run.by_oab?.[o] ?? 0) >= 0 && (run.errors?.[o] || (run.by_oab?.[o] ?? 0) > 0 || run.status !== "running"))
        .length
    : 0;
  const percent = oabCount > 0 ? Math.min(100, Math.round((completedOabs / oabCount) * 100)) : 0;
  const errorEntries = run?.errors ? Object.entries(run.errors).filter(([k]) => k !== "__hard_cap__") : [];
  const hardCapped = !!run?.errors?.__hard_cap__;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <Link
            to="/alvos"
            className="inline-flex items-center gap-1 text-[12px] text-zinc-500 hover:text-zinc-900 mb-1"
          >
            <Icon name="chevron-left" className="h-3.5 w-3.5" /> Alvos
          </Link>
          <div className="text-[11px] font-medium uppercase tracking-wide text-indigo-600">
            ⚖️ Descoberta de processos · advogado
          </div>
          <h1 className="font-display text-2xl md:text-[28px] tracking-tight text-zinc-900">
            {target.lawyer_name || "Advogado"}
          </h1>
          <p className="text-[13px] text-zinc-600 mt-0.5 inline-flex flex-wrap items-center gap-1.5">
            {oabs.map((o) => (
              <span
                key={o}
                className="inline-flex items-center px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100 text-[11.5px] font-medium tabular-nums"
              >
                {formatOABDisplay(o)}
              </span>
            ))}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refresh()}
            className="h-9 px-3 rounded-md border border-zinc-200 bg-white text-[13px] text-zinc-700 hover:bg-zinc-50 inline-flex items-center gap-1.5"
          >
            <Icon name="refresh-ccw" className="h-3.5 w-3.5" /> Atualizar
          </button>
          <button
            onClick={onRediscover}
            disabled={rediscoverState.loading || run?.status === "running"}
            className="h-9 px-3.5 rounded-md bg-zinc-900 text-white text-[13px] font-medium hover:bg-zinc-800 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {rediscoverState.loading ? (
              <Icon name="loader" className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Icon name="sparkles" className="h-3.5 w-3.5" />
            )}
            Redescobrir agora
          </button>
        </div>
      </div>

      {rediscoverState.msg && (
        <div
          className={
            "mb-4 rounded-md border p-3 text-[12.5px] " +
            (rediscoverState.kind === "ok"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-amber-50 border-amber-200 text-amber-800")
          }
        >
          {rediscoverState.msg}
        </div>
      )}

      {/* No run yet */}
      {!run ? (
        <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 p-12 text-center">
          <Icon name="search" className="h-6 w-6 text-zinc-400 mx-auto" />
          <h3 className="mt-3 text-[14px] font-medium text-zinc-900">
            Nenhuma descoberta executada ainda.
          </h3>
          <p className="mt-1 text-[12.5px] text-zinc-500">
            Clique em <span className="font-medium">Redescobrir agora</span> para
            iniciar a busca dos processos no DataJud.
          </p>
        </div>
      ) : (
        <>
          {/* Status card */}
          <div className="rounded-lg border border-zinc-200 bg-white p-5 mb-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={run.status} />
                  <span className="text-[12px] text-zinc-500">
                    iniciada {formatElapsed(run.started_at, run.finished_at)} {run.finished_at ? "atrás" : "atrás (em andamento)"}
                  </span>
                </div>
                <div className="mt-2 text-[13px] text-zinc-600">
                  Disparada por:{" "}
                  <span className="font-medium text-zinc-800">
                    {run.triggered_by === "initial"
                      ? "criação do alvo"
                      : run.triggered_by === "manual"
                        ? "redescoberta manual"
                        : "atualização periódica"}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-wide text-zinc-500">
                  Processos encontrados
                </div>
                <div className="font-display text-3xl tabular-nums text-zinc-900">
                  {run.total_found.toLocaleString("pt-BR")}
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-4">
              <div className="flex items-center justify-between text-[11.5px] text-zinc-500 mb-1.5">
                <span>
                  {run.status === "running"
                    ? `Buscando ${oabCount} OAB${oabCount !== 1 ? "s" : ""}…`
                    : `${oabCount} OAB${oabCount !== 1 ? "s" : ""} processada${oabCount !== 1 ? "s" : ""}`}
                </span>
                <span className="tabular-nums">
                  {run.status === "running" ? `${percent}%` : "100%"}
                </span>
              </div>
              <div className="h-2 rounded-full bg-zinc-100 overflow-hidden">
                <div
                  className={
                    "h-full rounded-full transition-all " +
                    (run.status === "completed"
                      ? "bg-emerald-500"
                      : run.status === "failed"
                        ? "bg-red-500"
                        : run.status === "partial"
                          ? "bg-orange-500"
                          : "bg-indigo-500 animate-pulse")
                  }
                  style={{
                    width: `${run.status === "running" ? percent : 100}%`,
                  }}
                  data-tick={tick}
                />
              </div>
            </div>
          </div>

          {/* Per-OAB breakdown */}
          <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden mb-4">
            <div className="px-4 py-2.5 border-b border-zinc-200 bg-zinc-50/60 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Resultados por OAB
            </div>
            <ul className="divide-y divide-zinc-100">
              {oabs.map((oab) => {
                const found = run.by_oab?.[oab] ?? 0;
                const err = run.errors?.[oab];
                return (
                  <li
                    key={oab}
                    className="px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono tabular-nums text-[13px] text-zinc-900">
                        {formatOABDisplay(oab)}
                      </span>
                      {err ? (
                        <span className="text-[11.5px] text-red-700 inline-flex items-center gap-1">
                          <Icon name="alert-circle" className="h-3 w-3" />
                          {err}
                        </span>
                      ) : run.status === "running" && found === 0 ? (
                        <span className="text-[11.5px] text-zinc-400 inline-flex items-center gap-1">
                          <Icon name="loader" className="h-3 w-3 animate-spin" />
                          aguardando…
                        </span>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <span className="text-[14px] tabular-nums font-medium text-zinc-900">
                        {found.toLocaleString("pt-BR")}
                      </span>
                      <span className="text-[11px] text-zinc-500 ml-1">
                        processo{found !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Errors / hard-cap */}
          {(hardCapped || errorEntries.length > 0) && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 mb-4">
              <div className="text-[12.5px] font-medium text-amber-900 inline-flex items-center gap-1.5">
                <Icon name="alert-triangle" className="h-3.5 w-3.5" />
                Avisos da descoberta
              </div>
              <ul className="mt-2 space-y-1 text-[12px] text-amber-900">
                {hardCapped && (
                  <li>
                    Limite máximo de 50.000 processos atingido — resultados podem
                    estar incompletos.
                  </li>
                )}
                {errorEntries.map(([k, v]) => (
                  <li key={k}>
                    <span className="font-mono">{k === "__hard_cap__" ? "" : formatOABDisplay(k)}</span>:{" "}
                    {v}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Footer actions */}
          {run.status !== "running" && (
            <div className="flex items-center justify-between gap-3 mt-6">
              <Link
                to="/alvos"
                className="text-[13px] text-zinc-600 hover:text-zinc-900 inline-flex items-center gap-1"
              >
                <Icon name="chevron-left" className="h-3.5 w-3.5" /> Voltar para
                Alvos
              </Link>
              {run.total_found > 0 && (
                <Link
                  to="/"
                  className="h-9 px-3.5 rounded-md bg-indigo-600 text-white text-[13px] font-medium hover:bg-indigo-700 inline-flex items-center gap-1.5"
                >
                  Ver movimentações{" "}
                  <Icon name="arrow-right" className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

DiscoveryPage.displayName = "DiscoveryPage";

// Wrap in AppShell
const Inner = Route.options.component!;
Route.update({
  component: () => (
    <AppShell route="alvos">
      <Inner />
    </AppShell>
  ),
});
