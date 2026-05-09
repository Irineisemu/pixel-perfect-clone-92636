// @ts-nocheck
import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "../components/Icon";
import { Utils } from "../lib/jr-utils";

const TIPOS_EVENTO = [
  { id: "intimacao_pessoal", label: "Intimação pessoal", desc: "Citações e intimações com prazo curto" },
  { id: "sentenca",          label: "Sentenças",           desc: "Decisões de mérito em 1ª instância" },
  { id: "decisao_inter",     label: "Decisões interlocutórias", desc: "Tutelas, liminares, saneadores" },
  { id: "audiencia",         label: "Audiências designadas", desc: "Inclui mudanças de pauta" },
  { id: "despacho",          label: "Despachos",           desc: "Mero expediente e saneamento" },
  { id: "juntada",           label: "Juntadas relevantes", desc: "Petições e laudos das partes" },
];

function Card({ title, desc, children }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white">
      <header className="px-5 py-3.5 border-b border-zinc-100">
        <h2 className="text-[14px] font-semibold text-zinc-900">{title}</h2>
        {desc && <p className="text-[12.5px] text-zinc-500 mt-0.5">{desc}</p>}
      </header>
      <div className="p-5 space-y-4">{children}</div>
    </section>
  );
}
function Field({ label, icon, required, children }) {
  return (
    <label className="block">
      <span className="flex items-center gap-1.5 text-[12px] font-medium text-zinc-700">
        {icon && <Icon name={icon} className="h-3.5 w-3.5 text-zinc-400" />}
        {label}
        {required && <span className="text-red-500">*</span>}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
function Toggle({ label, desc, checked, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className="w-full flex items-start gap-3 rounded-md hover:bg-zinc-50 px-2 py-2 -mx-2 text-left">
      <span className="flex-1">
        <span className="block text-[13px] font-medium text-zinc-900">{label}</span>
        {desc && <span className="block text-[11.5px] text-zinc-500">{desc}</span>}
      </span>
      <span className={Utils.cx("relative h-5 w-9 rounded-full transition mt-0.5", checked ? "bg-zinc-900" : "bg-zinc-200")}>
        <span className={Utils.cx(
          "absolute top-0.5 h-4 w-4 rounded-full bg-white transition shadow-sm",
          checked ? "left-[18px]" : "left-0.5"
        )} />
      </span>
    </button>
  );
}

const inputCx = "w-full h-9 px-2.5 rounded-md border border-zinc-200 bg-white text-[13px] focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/10";

export function Configuracoes() {
  const [form, setForm] = useState({
    emailPrincipal: "helena.costa@costaadv.br",
    emailSecundario: "alertas@costaadv.br",
    whatsapp: "+55 11 98765 4321",
    frequencia: "instantaneo",
    tipos: ["intimacao_pessoal", "sentenca", "decisao_inter"],
    horarioSilencioso: true,
  });
  const [state, setState] = useState<any>({ status: "idle", error: null });

  const update = (patch) => setForm((f) => ({ ...f, ...patch }));
  const toggleTipo = (id) =>
    setForm((f) => ({ ...f, tipos: f.tipos.includes(id) ? f.tipos.filter((x) => x !== id) : [...f.tipos, id] }));

  const onSave = async (e) => {
    e.preventDefault();
    setState({ status: "loading", error: null });
    try {
      await new Promise((r) => setTimeout(r, 900));
      setState({ status: "success", error: null });
      toast.success("Configurações salvas", { description: "Suas regras de alerta foram atualizadas." });
      setTimeout(() => setState({ status: "idle", error: null }), 1800);
    } catch (err: any) {
      setState({ status: "error", error: err?.message || "Falha ao salvar." });
      toast.error("Erro ao salvar", { description: "Verifique a conexão e tente novamente." });
    }
  };

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl tracking-tight text-zinc-900">Configurações de alerta</h1>
        <p className="text-[13.5px] text-zinc-500 mt-1">
          Defina como e quando você deseja ser notificada sobre movimentações monitoradas.
        </p>
      </div>

      <form onSubmit={onSave} className="space-y-6">
        <Card title="Canais de contato" desc="Onde você quer receber as notificações.">
          <Field label="E-mail principal" icon="mail" required>
            <input type="email" required value={form.emailPrincipal}
              onChange={(e) => update({ emailPrincipal: e.target.value })} className={inputCx} />
          </Field>
          <Field label="E-mail secundário (opcional)" icon="mail">
            <input type="email" value={form.emailSecundario}
              onChange={(e) => update({ emailSecundario: e.target.value })} className={inputCx} />
          </Field>
          <Field label="WhatsApp" icon="phone">
            <input type="tel" value={form.whatsapp}
              onChange={(e) => update({ whatsapp: e.target.value })}
              placeholder="+55 11 98765 4321" className={inputCx} />
          </Field>
          <p className="text-[11.5px] text-zinc-500 flex items-start gap-1.5">
            <Icon name="info" className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            Os envios são processados pelo backend do JusRadar. Esta interface apenas registra suas preferências.
          </p>
        </Card>

        <Card title="Frequência" desc="Com que frequência consolidar e enviar alertas.">
          <div className="grid sm:grid-cols-3 gap-2">
            {[
              { id: "instantaneo", label: "Instantâneo", desc: "Cada movimento, em até 5 min" },
              { id: "diario",      label: "Diário",      desc: "Resumo às 08h" },
              { id: "semanal",     label: "Semanal",     desc: "Segunda, 08h" },
            ].map((opt) => (
              <label key={opt.id}
                className={Utils.cx(
                  "block rounded-lg border p-3 cursor-pointer transition",
                  form.frequencia === opt.id
                    ? "border-zinc-900 bg-zinc-50/60 ring-1 ring-zinc-900"
                    : "border-zinc-200 hover:border-zinc-300"
                )}>
                <input type="radio" name="freq" value={opt.id} checked={form.frequencia === opt.id}
                  onChange={() => update({ frequencia: opt.id })} className="sr-only" />
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-zinc-900">{opt.label}</span>
                  {form.frequencia === opt.id && <Icon name="check" className="h-3.5 w-3.5 text-zinc-900" />}
                </div>
                <div className="text-[11.5px] text-zinc-500 mt-0.5">{opt.desc}</div>
              </label>
            ))}
          </div>
          <Toggle label="Silenciar entre 22h e 06h"
            desc="Eventos críticos ainda são enviados imediatamente."
            checked={form.horarioSilencioso} onChange={(v) => update({ horarioSilencioso: v })} />
        </Card>

        <Card title="Tipos de evento" desc="Quais movimentos devem disparar alerta.">
          <div className="grid sm:grid-cols-2 gap-2">
            {TIPOS_EVENTO.map((t) => {
              const on = form.tipos.includes(t.id);
              return (
                <button type="button" key={t.id} onClick={() => toggleTipo(t.id)}
                  className={Utils.cx(
                    "text-left rounded-lg border p-3 transition",
                    on ? "border-zinc-900 bg-zinc-50/60" : "border-zinc-200 hover:border-zinc-300"
                  )} aria-pressed={on}>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-medium text-zinc-900">{t.label}</span>
                    <span className={Utils.cx(
                      "h-4 w-4 rounded border grid place-items-center",
                      on ? "bg-zinc-900 border-zinc-900 text-white" : "border-zinc-300 bg-white"
                    )}>
                      {on && <Icon name="check" className="h-3 w-3" />}
                    </span>
                  </div>
                  <div className="text-[11.5px] text-zinc-500 mt-0.5">{t.desc}</div>
                </button>
              );
            })}
          </div>
        </Card>

        <div className="flex items-center justify-end gap-2 pt-2">
          {state.status === "error" && <span className="text-[12.5px] text-red-700">{state.error}</span>}
          <button type="button" className="h-9 px-3 rounded-md border border-zinc-200 bg-white text-[13px] text-zinc-700 hover:bg-zinc-50">Cancelar</button>
          <button type="submit" disabled={state.status === "loading"}
            className={Utils.cx(
              "inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md text-[13px] font-medium transition",
              state.status === "success" ? "bg-emerald-600 text-white" : "bg-zinc-900 hover:bg-zinc-800 text-white",
              state.status === "loading" && "opacity-80"
            )}>
            {state.status === "loading" && <Icon name="loader" className="h-3.5 w-3.5 animate-spin" />}
            {state.status === "success" && <Icon name="check" className="h-3.5 w-3.5" />}
            {state.status === "idle"    && <Icon name="save" className="h-3.5 w-3.5" />}
            {state.status === "loading" ? "Salvando…" : state.status === "success" ? "Salvo" : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}
export default Configuracoes;
