// @ts-nocheck
import { useEffect, Fragment } from "react";
import { Icon } from "./Icon";
import { Utils } from "../lib/jr-utils";
import { UrgencyBadge } from "./Feed";

function Section({ title, children }) {
  return (
    <section>
      <h3 className="text-[10.5px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Row({ icon, label, value, sub }) {
  return (
    <div className="flex items-start gap-2.5 py-1.5 border-b border-zinc-100 last:border-0">
      <Icon name={icon} className="h-3.5 w-3.5 text-zinc-400 mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-zinc-500">{label}</div>
        <div className="text-[13px] text-zinc-900">{value}</div>
        {sub && <div className="text-[12px] text-zinc-500">{sub}</div>}
      </div>
    </div>
  );
}

function DrawerContent({ m, onClose }) {
  const u = Utils.URGENCIA[m.urgencia];
  return (
    <Fragment>
      <header className="flex items-start gap-3 px-5 py-4 border-b border-zinc-200">
        <div className={Utils.cx("h-9 w-1 rounded-full mt-0.5", u.bar)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <UrgencyBadge urgencia={m.urgencia} />
            <span className="text-[11px] text-zinc-500">{m.tribunal} · {Utils.tempoRelativo(m.publicadoEm)}</span>
          </div>
          <h2 className="font-display text-[20px] tracking-tight text-zinc-900 mt-1.5 leading-tight">{m.tipo}</h2>
          <button onClick={() => navigator.clipboard?.writeText(m.numero)}
            className="mt-1 inline-flex items-center gap-1 font-mono text-[12px] text-zinc-600 hover:text-zinc-900"
            aria-label="Copiar número do processo">
            {m.numero} <Icon name="copy" className="h-3 w-3" />
          </button>
        </div>
        <button onClick={onClose} aria-label="Fechar detalhes"
          className="grid h-8 w-8 place-items-center rounded-md hover:bg-zinc-100 text-zinc-500">
          <Icon name="x" className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {m.prazo && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 flex gap-3">
            <Icon name="alert-triangle" className="h-4 w-4 text-red-600 mt-0.5" />
            <div className="text-[12.5px] text-red-800">
              <div className="font-semibold">Prazo: {Utils.dataHora(m.prazo)}</div>
              <div className="text-red-700/90">Confirme intimação pessoal e contagem em dias úteis.</div>
            </div>
          </div>
        )}

        <Section title="Resumo">
          <p className="text-[13.5px] leading-relaxed text-zinc-700">{m.detalhe}</p>
        </Section>

        <Section title="Identificação">
          <Row icon="building-2" label="Tribunal" value={`${m.tribunal} — ${m.tribunalNome}`} />
          <Row icon="file-text" label="Tipo de movimento" value={m.tipo} />
          <Row icon="user" label="Parte monitorada" value={m.parte} sub={m.parteQualificacao} />
          <Row icon="clock" label="Publicado em" value={Utils.dataHora(m.publicadoEm)} />
          {m.contraEstado && <Row icon="alert-triangle" label="Adversário" value="Ente público / Fazenda" />}
        </Section>

        <Section title="Andamento (últimos 5)">
          <ol className="relative border-l border-zinc-200 ml-1 space-y-3 pl-4">
            {[
              { t: "Movimento atual", d: m.tipo, w: Utils.tempoRelativo(m.publicadoEm), cur: true },
              { t: "Conclusos para decisão", d: "Autos conclusos ao juízo.", w: "há 2 d" },
              { t: "Petição da parte ré", d: "Manifestação sobre prova pericial.", w: "há 5 d" },
              { t: "Despacho", d: "Vista comum às partes.", w: "há 8 d" },
              { t: "Distribuição", d: "Distribuído por sorteio à 3ª Vara.", w: "há 22 d" },
            ].map((s, i) => (
              <li key={i} className="relative">
                <span className={Utils.cx(
                  "absolute -left-[21px] top-1 h-2 w-2 rounded-full ring-4",
                  s.cur ? "bg-zinc-900 ring-zinc-100" : "bg-zinc-300 ring-white"
                )} />
                <div className="text-[12.5px] text-zinc-900 font-medium">{s.t}</div>
                <div className="text-[12px] text-zinc-600">{s.d}</div>
                <div className="text-[11px] text-zinc-400 tabular-nums">{s.w}</div>
              </li>
            ))}
          </ol>
        </Section>
      </div>

      <footer className="border-t border-zinc-200 p-3 flex items-center gap-2">
        <button className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-zinc-200 bg-white hover:bg-zinc-50 text-[13px] font-medium text-zinc-800">
          <Icon name="bookmark-plus" className="h-4 w-4" /> Marcar
        </button>
        <button className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-zinc-200 bg-white hover:bg-zinc-50 text-[13px] font-medium text-zinc-800">
          <Icon name="share-2" className="h-4 w-4" /> Encaminhar
        </button>
        <div className="ml-auto" />
        <button className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white text-[13px] font-medium">
          Abrir autos <Icon name="external-link" className="h-4 w-4" />
        </button>
      </footer>
    </Fragment>
  );
}

export function Drawer({ movimento, onClose }) {
  useEffect(() => {
    if (!movimento) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [movimento, onClose]);

  return (
    <div className={Utils.cx("fixed inset-0 z-50 transition", movimento ? "pointer-events-auto" : "pointer-events-none")}
         aria-hidden={!movimento}>
      <div onClick={onClose}
           className={Utils.cx("absolute inset-0 bg-zinc-900/30 transition-opacity duration-200", movimento ? "opacity-100" : "opacity-0")} />
      <aside role="dialog" aria-modal="true" aria-label="Detalhes da movimentação"
             className={Utils.cx(
               "absolute right-0 top-0 h-full w-full sm:max-w-xl bg-white shadow-xl border-l border-zinc-200 transition-transform duration-300 flex flex-col",
               movimento ? "translate-x-0" : "translate-x-full"
             )}>
        {movimento && <DrawerContent m={movimento} onClose={onClose} />}
      </aside>
    </div>
  );
}
export default Drawer;
