// @ts-nocheck
import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Mock } from "../data/mock";
import { Utils } from "../lib/jr-utils";
import { useTargets } from "../lib/useTargets";
import { Header } from "./Header";
import { KpiRow } from "./Kpis";
import { Filtros } from "./Filtros";
import { Feed } from "./Feed";
import { TribunalStatus } from "./TribunalStatus";
import { Drawer } from "./Drawer";
import { CmdK } from "./CmdK";

const PAGE_SIZE = 10;

function RegrasCard() {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Regras ativas</h3>
        <button className="text-[11.5px] text-zinc-600 hover:text-zinc-900">Gerenciar</button>
      </div>
      <ul className="mt-2 space-y-1.5 text-[12.5px]">
        {[
          { name: "Professores — magistério público", n: 142 },
          { name: "Ações contra o Estado de SP",      n: 87 },
          { name: "Intimações pessoais",              n: 23 },
          { name: "Sentenças trabalhistas",           n: 41 },
        ].map((r) => (
          <li key={r.name} className="flex items-center justify-between">
            <span className="text-zinc-700 truncate">{r.name}</span>
            <span className="text-zinc-400 tabular-nums">{r.n}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AppShell({ route, children }: { route: "inicio" | "alvos" | "configuracoes"; children?: React.ReactNode }) {
  const navigate = useNavigate();
  const onNav = (id: string) => {
    if (id === "inicio") navigate({ to: "/" });
    else if (id === "alvos") navigate({ to: "/alvos" });
    else if (id === "configuracoes") navigate({ to: "/configuracoes" });
  };

  const { movimentacoes, tribunais } = Mock;
  const targetsHook = useTargets();
  const targetsActive = targetsHook.items.filter((t) => t.active);
  const targetsCount = targetsHook.counters;

  const targetByMov = useMemo(() => {
    const map: any = {};
    const list = targetsActive;
    const radarPro = list.find((t) => t.type === "radar" && (t.keywords || []).some((k) => /professor|magist/i.test(k)));
    const radarQ   = list.find((t) => t.type === "radar" && (t.keywords || []).some((k) => /quint|incorpor/i.test(k)));
    movimentacoes.forEach((m) => {
      const person = list.find((t) => t.type === "person" && t.full_name && m.parte.toLowerCase().includes(t.full_name.toLowerCase()));
      if (person) { map[m.id] = person; return; }
      const proc = list.find((t) => t.type === "process" && t.process_number && m.numero.replace(/\D/g, "") === t.process_number.replace(/\D/g, ""));
      if (proc) { map[m.id] = proc; return; }
      if (radarQ && /quint|incorpor/i.test(m.detalhe + " " + m.resumo)) { map[m.id] = radarQ; return; }
      if (radarPro && Utils.isProfessor(m.parteQualificacao) && m.contraEstado) { map[m.id] = radarPro; return; }
    });
    return map;
  }, [targetsActive, movimentacoes]);

  const [filtros, setFiltros] = useState({
    preset: "todos", tribunal: "todos", urgencia: "todas", periodo: "todos", q: "", alvoId: "",
  });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  useEffect(() => { const t = setTimeout(() => setLoading(false), 450); return () => clearTimeout(t); }, []);
  useEffect(() => { setPage(1); }, [filtros]);

  const NOW = Utils.NOW;
  const filtered = useMemo(() => movimentacoes.filter((m) => {
    if (filtros.preset === "estado" && !m.contraEstado) return false;
    if (filtros.preset === "professores" && !Utils.isProfessor(m.parteQualificacao)) return false;
    if (filtros.tribunal !== "todos" && m.tribunal !== filtros.tribunal) return false;
    if (filtros.urgencia !== "todas" && m.urgencia !== filtros.urgencia) return false;
    if (filtros.periodo !== "todos") {
      const t = new Date(m.publicadoEm).getTime();
      const diff = NOW - t;
      const limit = filtros.periodo === "24h" ? 24*3600e3 : filtros.periodo === "7d" ? 7*86400e3 : 30*86400e3;
      if (diff > limit) return false;
    }
    if (filtros.q.trim()) {
      const q = filtros.q.trim().toLowerCase();
      if (!m.parte.toLowerCase().includes(q) && !m.parteQualificacao.toLowerCase().includes(q)) return false;
    }
    if (filtros.alvoId) {
      if (!targetByMov[m.id] || targetByMov[m.id].id !== filtros.alvoId) return false;
    }
    return true;
  }), [filtros, movimentacoes, NOW, targetByMov]);

  const counts = useMemo(() => ({
    todos: movimentacoes.length,
    estado: movimentacoes.filter((m) => m.contraEstado).length,
    professores: movimentacoes.filter((m) => Utils.isProfessor(m.parteQualificacao)).length,
  }), [movimentacoes]);

  const visible = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = visible.length < filtered.length;
  const onLoadMore = useCallback(() => {
    if (loading) return;
    setLoading(true);
    setTimeout(() => { setPage((p) => p + 1); setLoading(false); }, 350);
  }, [loading]);

  const stats = useMemo(() => {
    const novas24h = movimentacoes.filter((m) => NOW - new Date(m.publicadoEm).getTime() < 24*3600e3).length;
    const urgentes = movimentacoes.filter((m) => m.urgencia === "critico" || m.urgencia === "alto").length;
    const tribunaisAtivos = tribunais.filter((t) => t.status === "ativo").length;
    const tribunaisAtrasados = tribunais.filter((t) => t.status !== "ativo").length;
    return { totalMonitorado: 487, novas24h, urgentes, tribunaisAtivos, tribunaisTotal: tribunais.length, tribunaisAtrasados };
  }, [movimentacoes, tribunais, NOW]);

  const [selected, setSelected] = useState(null);
  const [cmdkOpen, setCmdkOpen] = useState(false);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setCmdkOpen((s) => !s); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // bridge legacy CustomEvent("toast") -> sonner
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
              <h1 className="font-display text-2xl md:text-[28px] tracking-tight text-zinc-900">Bom dia, Helena.</h1>
              <p className="text-[13.5px] text-zinc-600 mt-0.5">
                {stats.novas24h} novas movimentações desde ontem · {stats.urgentes} pedem atenção hoje.
              </p>
            </div>
            <div className="text-[11.5px] text-zinc-500">
              Última atualização: <span className="text-zinc-700 tabular-nums">há 2 min</span>
            </div>
          </div>

          <KpiRow stats={stats} />

          <div className="mt-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
            <section className="min-w-0">
              <Filtros filtros={filtros} setFiltros={setFiltros} counts={counts} tribunaisDisponiveis={tribunais} alvos={targetsActive} />
              <div className="mt-3 flex items-center justify-between text-[12px] text-zinc-500">
                <span>
                  {filtered.length} {filtered.length === 1 ? "movimentação" : "movimentações"}
                  {filtros.preset !== "todos" && (
                    <> · filtro: <span className="text-zinc-700 font-medium">
                      {filtros.preset === "estado" ? "Ações contra o Estado" : "Professores"}
                    </span></>
                  )}
                </span>
                <span className="hidden sm:inline">Ordenado por: <span className="text-zinc-700">mais recentes</span></span>
              </div>
              <div className="mt-2">
                <Feed items={visible} loading={loading} hasMore={hasMore}
                  onLoadMore={onLoadMore} onSelect={setSelected}
                  targetByMov={targetByMov}
                  onFilterByTarget={(t) => setFiltros((f) => ({ ...f, alvoId: t.id }))} />
              </div>
            </section>

            <aside className="lg:sticky lg:top-[72px] lg:self-start space-y-4">
              <TribunalStatus tribunais={tribunais} compact />
              <div className="text-[11.5px] text-zinc-500 px-1">
                Monitorando: <button onClick={() => onNav("alvos")} className="text-zinc-700 hover:text-zinc-900 hover:underline font-medium">{targetsCount.active} alvo{targetsCount.active !== 1 ? "s" : ""}</button> · {targetsCount.process} processo{targetsCount.process !== 1 ? "s" : ""}
              </div>
              <RegrasCard />
            </aside>
          </div>
        </main>
      ) : (
        <main className="mx-auto max-w-[1440px] px-4 md:px-6 py-5 lg:py-7">
          {children}
        </main>
      )}

      <Drawer movimento={selected} onClose={() => setSelected(null)} />
      <CmdK open={cmdkOpen} onClose={() => setCmdkOpen(false)} onSelectMov={setSelected} />
    </div>
  );
}
export default AppShell;
