// @ts-nocheck
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getUserJobs, retryJob } from "../lib/jobs.functions";
import { getWorkerStatus } from "../lib/worker-status.functions";

const STATUS_OPTIONS = ["queued", "needs_scraping", "processing", "done", "dead_letter"];

const statusColor: Record<string, string> = {
  done: "bg-emerald-50 text-emerald-700",
  dead_letter: "bg-red-50 text-red-700",
  processing: "bg-blue-50 text-blue-700",
  needs_scraping: "bg-amber-50 text-amber-700",
  queued: "bg-zinc-100 text-zinc-700",
};

function fmtDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 1000)}s`;
}

function jobDurationMs(j: any) {
  if (!j.locked_until || !j.updated_at) return null;
  // locked_until = updated_at + 300s; quando termina, locked_until é zerado.
  // Para jobs done/dead_letter, usamos updated_at - created_at como aproximação.
  const start = new Date(j.created_at).getTime();
  const end = new Date(j.updated_at).getTime();
  return Math.max(0, end - start);
}

export function Jobs() {
  const fetchJobs = useServerFn(getUserJobs);
  const fetchWorker = useServerFn(getWorkerStatus);
  const retry = useServerFn(retryJob);

  const [filters, setFilters] = useState<{ status: string[]; tribunal?: string; errorKind?: string; page: number }>({
    status: [],
    page: 1,
  });
  const [data, setData] = useState<any>({ rows: [], total: 0, kpis: {} });
  const [worker, setWorker] = useState<any>({ workers: [], anyOnline: false, hasAny: false });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [res, ws] = await Promise.all([
        fetchJobs({ data: { ...filters, pageSize: 25 } }),
        fetchWorker().catch(() => ({ workers: [], anyOnline: false, hasAny: false })),
      ]);
      setData(res);
      setWorker(ws);
    } catch (e: any) {
      toast.error("Erro ao carregar", { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filters]);
  useEffect(() => {
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, [filters]);

  const toggleStatus = (s: string) => {
    setFilters((f) => ({
      ...f,
      page: 1,
      status: f.status.includes(s) ? f.status.filter((x) => x !== s) : [...f.status, s],
    }));
  };

  const totalPages = Math.max(1, Math.ceil(data.total / 25));

  return (
    <div className="max-w-6xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl tracking-tight text-zinc-900">Jobs de scraping</h1>
        <p className="text-[13.5px] text-zinc-500 mt-1">
          Acompanhe a fila de raspagem dos seus alvos. Atualiza a cada 10s.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: "Últimas 24h", value: data.kpis?.total24h ?? 0 },
          { label: "Sucesso", value: data.kpis?.successRate != null ? `${data.kpis.successRate}%` : "—" },
          { label: "Falhas (dead-letter)", value: data.kpis?.failed24h ?? 0, danger: true },
          { label: "Pendentes", value: data.kpis?.pending ?? 0 },
        ].map((k) => (
          <div key={k.label} className="rounded-lg border border-zinc-200 bg-white p-3">
            <div className="text-[11px] uppercase tracking-wide text-zinc-500">{k.label}</div>
            <div className={`mt-1 text-xl font-semibold ${k.danger ? "text-red-700" : "text-zinc-900"}`}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-3 items-center">
        {STATUS_OPTIONS.map((s) => (
          <button key={s} onClick={() => toggleStatus(s)}
            className={`text-[12px] px-2.5 h-7 rounded-full border ${
              filters.status.includes(s) ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
            }`}>
            {s}
          </button>
        ))}
        <select value={filters.tribunal ?? ""} onChange={(e) => setFilters((f) => ({ ...f, tribunal: e.target.value || undefined, page: 1 }))}
          className="h-7 px-2 text-[12px] rounded-md border border-zinc-200">
          <option value="">Todos tribunais</option>
          <option value="tjrj">TJRJ</option>
          <option value="tjsp">TJSP</option>
        </select>
        <button onClick={load} className="ml-auto text-[12px] text-zinc-600 hover:text-zinc-900">
          {loading ? "Atualizando…" : "Atualizar"}
        </button>
      </div>

      {/* Tabela */}
      <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
        <table className="w-full text-[12.5px]">
          <thead className="bg-zinc-50 text-zinc-600">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Tribunal</th>
              <th className="text-left px-3 py-2 font-medium">Processo</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-left px-3 py-2 font-medium">Tent.</th>
              <th className="text-left px-3 py-2 font-medium">Duração</th>
              <th className="text-left px-3 py-2 font-medium">Último erro</th>
              <th className="text-left px-3 py-2 font-medium">Atualizado</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {data.rows.length === 0 && !loading && (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-zinc-500">Nenhum job encontrado.</td></tr>
            )}
            {data.rows.map((j: any) => {
              const dur = jobDurationMs(j);
              return (
                <tr key={j.id} className="hover:bg-zinc-50/60 cursor-pointer" onClick={() => setSelected(j)}>
                  <td className="px-3 py-2 uppercase">{j.tribunal}</td>
                  <td className="px-3 py-2 font-mono text-[11.5px]">{j.process_number}</td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-[11px] ${statusColor[j.status] || "bg-zinc-100"}`}>{j.status}</span>
                  </td>
                  <td className="px-3 py-2">{j.attempts}/{j.max_attempts}</td>
                  <td className="px-3 py-2">{dur != null ? fmtDuration(dur) : "—"}</td>
                  <td className="px-3 py-2 max-w-[280px] truncate">
                    {j.last_error_kind && (
                      <span
                        className={`text-[10.5px] uppercase mr-1 px-1 py-0.5 rounded ${
                          j.last_error_kind === "auth_failed" || j.last_error_kind === "auth_required"
                            ? "bg-red-100 text-red-800"
                            : j.last_error_kind === "captcha_required"
                            ? "bg-amber-100 text-amber-800"
                            : j.last_error_kind === "blocked"
                            ? "bg-orange-100 text-orange-800"
                            : "bg-zinc-100 text-zinc-700"
                        }`}
                      >
                        {j.last_error_kind}
                      </span>
                    )}
                    <span className="text-red-700">{j.last_error}</span>
                  </td>
                  <td className="px-3 py-2 text-zinc-500">{new Date(j.updated_at).toLocaleString("pt-BR")}</td>
                  <td className="px-3 py-2">
                    {(j.status === "dead_letter" || j.status === "needs_scraping") && (
                      <button onClick={(e) => { e.stopPropagation(); retry({ data: { id: j.id } }).then(() => { toast.success("Reenfileirado"); load(); }); }}
                        className="h-7 px-2 rounded border border-zinc-200 text-[11.5px] hover:bg-zinc-50">
                        Reprocessar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      <div className="flex items-center justify-between mt-3 text-[12px] text-zinc-600">
        <span>{data.total} jobs · página {filters.page} de {totalPages}</span>
        <div className="flex gap-2">
          <button disabled={filters.page <= 1} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
            className="h-7 px-2 rounded border border-zinc-200 disabled:opacity-40">Anterior</button>
          <button disabled={filters.page >= totalPages} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
            className="h-7 px-2 rounded border border-zinc-200 disabled:opacity-40">Próxima</button>
        </div>
      </div>

      {/* Drawer de detalhes */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/30" onClick={() => setSelected(null)}>
          <aside className="absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-xl p-5 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[15px] font-semibold">Job {selected.id.slice(0, 8)}</h3>
              <button onClick={() => setSelected(null)} className="text-zinc-500 hover:text-zinc-900">✕</button>
            </div>
            <dl className="text-[12.5px] space-y-1.5">
              <div><dt className="inline text-zinc-500">Tribunal: </dt><dd className="inline uppercase">{selected.tribunal}</dd></div>
              <div><dt className="inline text-zinc-500">Processo: </dt><dd className="inline font-mono">{selected.process_number}</dd></div>
              <div><dt className="inline text-zinc-500">Kind: </dt><dd className="inline">{selected.kind}</dd></div>
              <div><dt className="inline text-zinc-500">Status: </dt><dd className="inline">{selected.status}</dd></div>
              <div><dt className="inline text-zinc-500">Tentativas: </dt><dd className="inline">{selected.attempts}/{selected.max_attempts}</dd></div>
              <div><dt className="inline text-zinc-500">Agendado para: </dt><dd className="inline">{new Date(selected.scheduled_for).toLocaleString("pt-BR")}</dd></div>
            </dl>
            {selected.last_error && (
              <div className="mt-4 rounded border border-red-200 bg-red-50 p-3">
                <div className="text-[11px] uppercase text-red-700">{selected.last_error_kind}</div>
                <div className="text-[12.5px] text-red-900 mt-1 whitespace-pre-wrap">{selected.last_error}</div>
              </div>
            )}
            <div className="mt-4">
              <div className="text-[11px] uppercase text-zinc-500 mb-1">Payload</div>
              <pre className="text-[11.5px] bg-zinc-50 p-3 rounded border border-zinc-200 overflow-x-auto">
                {JSON.stringify(selected.payload, null, 2)}
              </pre>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
