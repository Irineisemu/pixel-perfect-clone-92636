// @ts-nocheck
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listProcessMovements } from "@/lib/process.functions";

const PAGE_SIZE = 20;

export function ProcessMovementsTree({ processId }: { processId: string }) {
  const fetchMovements = useServerFn(listProcessMovements);
  const [pages, setPages] = useState<any[][]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = async (nextPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const res: any = await fetchMovements({
        data: { processId, page: nextPage, pageSize: PAGE_SIZE },
      });
      if (res?.error) {
        setError(res.error);
      } else {
        setPages((prev) => {
          const copy = [...prev];
          copy[nextPage - 1] = res.movements;
          return copy;
        });
        setTotal(res.total);
        setPage(nextPage);
      }
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processId]);

  const flat = pages.flat().filter(Boolean);
  const hasMore = flat.length < total;

  return (
    <div className="mt-3 border-t border-zinc-100 pt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] font-medium text-zinc-700">
          Histórico de movimentações
          {total > 0 && <span className="text-zinc-500 font-normal"> ({flat.length} de {total})</span>}
        </span>
      </div>

      {error && (
        <div className="text-[12px] text-rose-600 mb-2">Erro: {error}</div>
      )}

      {flat.length === 0 && !loading && !error && (
        <div className="text-[12px] text-zinc-500 italic">Nenhuma movimentação registrada.</div>
      )}

      <ol className="relative border-l border-zinc-200 ml-2 space-y-3">
        {flat.map((m: any) => (
          <li key={m.id} className="ml-4">
            <span
              className={`absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border ${
                m.is_new ? "bg-rose-500 border-rose-500" : "bg-white border-zinc-300"
              }`}
            />
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[12.5px] text-zinc-900 font-medium">
                  {m.movement_name}
                  {m.movement_code != null && (
                    <span className="ml-1 text-[10.5px] font-mono text-zinc-400">#{m.movement_code}</span>
                  )}
                </div>
                {m.organ_name && (
                  <div className="text-[11px] text-zinc-500">{m.organ_name}</div>
                )}
                {Array.isArray(m.complements) && m.complements.length > 0 && (
                  <ul className="mt-1 ml-2 space-y-0.5 text-[11px] text-zinc-600 list-disc list-inside">
                    {m.complements.map((c: any, idx: number) => (
                      <li key={idx}>
                        {typeof c === "string" ? c : c?.descricao ?? JSON.stringify(c)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="text-[10.5px] text-zinc-500 flex-shrink-0 whitespace-nowrap">
                {new Date(m.occurred_at).toLocaleString("pt-BR")}
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-3 flex items-center justify-center">
        {hasMore && (
          <button
            onClick={() => loadPage(page + 1)}
            disabled={loading}
            className="px-3 py-1.5 rounded-md border border-zinc-200 bg-white text-[12px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            {loading ? "Carregando…" : `Ver mais (${total - flat.length} restantes)`}
          </button>
        )}
        {!hasMore && flat.length > PAGE_SIZE && (
          <span className="text-[11px] text-zinc-400">Fim do histórico</span>
        )}
      </div>
    </div>
  );
}

export default ProcessMovementsTree;
