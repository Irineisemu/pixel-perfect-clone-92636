// @ts-nocheck
import { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Icon } from "../components/Icon";
import { Utils } from "../lib/jr-utils";
const TRIBUNAIS_SUPORTADOS = [
  { sigla: "TJRJ", nome: "Tribunal de Justiça do Rio de Janeiro", status: "ativo" },
];
import {
  useTargets, validateCNJNumber, validateCPF, maskCPF, maskCNJ, maskOAB,
  detectTribunalAlias, RADAR_LIMIT, CLASS_CODES, QUALIFICATIONS, typeMeta,
} from "../lib/useTargets";
import { LawyerTargetForm, LawyerTargetFormHandle, validateLawyer } from "../components/LawyerTargetForm";
import { createLawyerTarget } from "../lib/lawyer.functions";
import { ProcessNumberForm } from "../components/ProcessNumberForm";

function Sparkline({ values, className = "h-5 w-16" }) {
  if (!values || values.length === 0) return null;
  const max = Math.max(...values, 1);
  const w = 64, h = 20;
  const step = w / Math.max(values.length - 1, 1);
  const pts = values.map((v, i) => `${i * step},${h - (v / max) * (h - 2) - 1}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} aria-hidden="true">
      <polyline fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" points={pts} />
    </svg>
  );
}

function TypeBadge({ type }) {
  const m = typeMeta[type];
  return (
    <span className={Utils.cx("inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded border text-[10.5px] font-medium uppercase tracking-wide", m.chip)}>
      <span className={Utils.cx("h-1.5 w-1.5 rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}

function StatusToggle({ active, onToggle }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onToggle(); }} aria-pressed={active}
      className={Utils.cx(
        "relative inline-flex h-5 w-9 rounded-full transition-colors",
        active ? "bg-emerald-500" : "bg-zinc-300"
      )}>
      <span className={Utils.cx(
        "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
        active ? "translate-x-[18px]" : "translate-x-0.5"
      )} />
    </button>
  );
}

function targetIdentifier(t) {
  if (t.type === "person") return { primary: t.full_name, secondary: (t.cpf ? t.cpf + " · " : "") + t.qualification + (t.aliases?.length ? ` · ${t.aliases.length} variação${t.aliases.length>1?"es":""}` : "") };
  if (t.type === "process") return { primary: maskCNJ(t.process_number), secondary: `${t.tribunal_alias || "—"}${t.nickname ? ` · ${t.nickname}` : ""}`, mono: true };
  if (t.type === "lawyer") return { primary: t.lawyer_name, secondary: `OAB: ${(t.oab_numbers || []).join(", ")}`, processCount: t.processCount };
  const tribunais = (t.tribunal_aliases || []).join(", ") || "Todos";
  const classes = (t.class_codes || []).slice(0, 2).join(" · ");
  const kw = (t.keywords || []).slice(0, 2).map((k) => `"${k}"`).join(" ");
  return { primary: `${tribunais} · ${classes || "Qualquer classe"}`, secondary: kw + (t.against_state_only ? " · contra Estado" : "") };
}

function TagsInput({ value, onChange, placeholder, ariaLabel }) {
  const [draft, setDraft] = useState("");
  const tags = value || [];
  const commit = () => {
    const v = draft.trim();
    if (!v) return;
    if (!tags.includes(v)) onChange([...tags, v]);
    setDraft("");
  };
  return (
    <div className="min-h-[36px] w-full flex flex-wrap items-center gap-1.5 px-2 py-1.5 rounded-md border border-zinc-200 bg-white focus-within:ring-2 focus-within:ring-zinc-900/10 focus-within:border-zinc-400">
      {tags.map((t, i) => (
        <span key={i} className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-zinc-100 text-[12px] text-zinc-800">
          {t}
          <button type="button" onClick={() => onChange(tags.filter((_, j) => j !== i))} aria-label={`Remover ${t}`} className="text-zinc-500 hover:text-zinc-900">
            <Icon name="x" className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={ariaLabel}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commit(); }
          else if (e.key === "Backspace" && !draft && tags.length) onChange(tags.slice(0, -1));
        }}
        onBlur={commit}
        placeholder={tags.length ? "" : placeholder}
        className="flex-1 min-w-[120px] h-7 px-1 bg-transparent outline-none text-[13px] placeholder:text-zinc-400"
      />
    </div>
  );
}

const Field = ({ label, hint, error, required, children, htmlFor }) => (
  <div>
    <label htmlFor={htmlFor} className="flex items-center justify-between text-[11.5px] font-medium uppercase tracking-wide text-zinc-600">
      <span>{label}{required && <span className="text-red-500 ml-0.5">*</span>}</span>
      {hint && <span className="text-[10.5px] text-zinc-400 normal-case font-normal tracking-normal">{hint}</span>}
    </label>
    <div className="mt-1.5">{children}</div>
    {error && <div role="alert" aria-live="polite" className="mt-1 text-[11.5px] text-red-600 inline-flex items-center gap-1"><Icon name="alert-circle" className="h-3 w-3" />{error}</div>}
  </div>
);

const TextInput = ({ error, className, ...p }: any) => (
  <input {...p} className={Utils.cx(
    "w-full h-9 px-2.5 rounded-md border bg-white text-[13px] focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400",
    error ? "border-red-300" : "border-zinc-200",
    className
  )} />
);

const Select = ({ value, onChange, options, ...rest }) => (
  <select value={value} onChange={onChange} {...rest}
    className="w-full h-9 px-2.5 rounded-md border border-zinc-200 bg-white text-[13px] focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400">
    {options.map((o) => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
  </select>
);

function MultiCheck({ options, value, onChange, columns = 1 }) {
  return (
    <div className={Utils.cx("grid gap-1.5", columns === 2 && "sm:grid-cols-2", columns === 3 && "sm:grid-cols-3")}>
      {options.map((o) => {
        const v = o.value ?? o;
        const label = o.label ?? o;
        const on = value.includes(v);
        return (
          <label key={v} className={Utils.cx(
            "flex items-center gap-2 px-2.5 py-2 rounded-md border cursor-pointer text-[12.5px]",
            on ? "border-zinc-900 bg-zinc-900/5" : "border-zinc-200 hover:border-zinc-300 bg-white"
          )}>
            <span className={Utils.cx("grid place-items-center h-4 w-4 rounded border", on ? "bg-zinc-900 border-zinc-900 text-white" : "border-zinc-300 bg-white")}>
              {on && <Icon name="check" className="h-3 w-3" strokeWidth={3} />}
            </span>
            <span className="text-zinc-800">{label}</span>
            <input type="checkbox" className="sr-only" checked={on} onChange={() => onChange(on ? value.filter((x) => x !== v) : [...value, v])} />
          </label>
        );
      })}
    </div>
  );
}

function PersonForm({ data, setData, errors }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label="Nome completo" required error={errors.full_name}>
          <TextInput value={data.full_name || ""} onChange={(e) => setData({ full_name: e.target.value })} placeholder="Ex.: Maria Clara Andrade" error={errors.full_name} />
        </Field>
      </div>
      <Field label="CPF" hint="opcional · com DV" error={errors.cpf}>
        <TextInput value={data.cpf || ""} onChange={(e) => setData({ cpf: maskCPF(e.target.value) })} placeholder="000.000.000-00" inputMode="numeric" error={errors.cpf} />
      </Field>
      <Field label="OAB" hint="opcional · UF000000" error={errors.oab}>
        <TextInput value={data.oab || ""} onChange={(e) => setData({ oab: maskOAB(e.target.value) })} placeholder="SP145220" error={errors.oab} />
      </Field>
      <Field label="Qualificação">
        <Select value={data.qualification || "Outro"} onChange={(e) => setData({ qualification: e.target.value })} options={QUALIFICATIONS} />
      </Field>
      <Field label="Variações do nome" hint="enter ou vírgula para adicionar">
        <TagsInput value={data.aliases || []} onChange={(v) => setData({ aliases: v })} placeholder="Ex.: João Silva, J. Silva" ariaLabel="Adicionar variação do nome" />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Notas internas" hint="opcional">
          <textarea value={data.notes || ""} onChange={(e) => setData({ notes: e.target.value })} rows={3}
            placeholder="Contexto, contato, número do contrato…"
            className="w-full px-2.5 py-2 rounded-md border border-zinc-200 bg-white text-[13px] focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400" />
        </Field>
      </div>
    </div>
  );
}

function ProcessForm({ data, setData, errors, tribunais }) {
  useEffect(() => {
    const det = detectTribunalAlias(data.process_number || "");
    if (det && !data.tribunal_alias) setData({ tribunal_alias: det });
  }, [data.process_number]);
  const isValid = validateCNJNumber(data.process_number || "");
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label="Número CNJ" required hint="máscara automática + DV" error={errors.process_number}>
          <div className="relative">
            <TextInput value={data.process_number || ""} onChange={(e) => setData({ process_number: maskCNJ(e.target.value) })}
              placeholder="0000000-00.0000.0.00.0000" inputMode="numeric" error={errors.process_number}
              className="font-mono pr-9" />
            {(data.process_number || "").replace(/\D/g, "").length === 20 && (
              <span className={Utils.cx("absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 text-[11px] font-medium",
                isValid ? "text-emerald-600" : "text-red-600")}>
                <Icon name={isValid ? "check-circle-2" : "alert-circle"} className="h-4 w-4" />
              </span>
            )}
          </div>
        </Field>
      </div>
      <Field label="Tribunal" hint="auto-detectado · sobrescreva se necessário">
        <Select value={data.tribunal_alias || ""} onChange={(e) => setData({ tribunal_alias: e.target.value })}
          options={[{ value: "", label: "—" }, ...tribunais.map((t) => ({ value: t.sigla, label: `${t.sigla} — ${t.nome}` }))]} />
      </Field>
      <Field label="Apelido interno" hint="opcional">
        <TextInput value={data.nickname || ""} onChange={(e) => setData({ nickname: e.target.value })} placeholder="Ex.: Andrade — reintegração" />
      </Field>
    </div>
  );
}

function RadarForm({ data, setData, errors, tribunais }) {
  return (
    <div className="grid gap-4">
      <Field label="Tribunais a monitorar" required error={errors.tribunal_aliases}>
        <MultiCheck options={tribunais.map((t) => ({ value: t.sigla, label: `${t.sigla} · ${t.nome}` }))}
          value={data.tribunal_aliases || []} onChange={(v) => setData({ tribunal_aliases: v })} columns={2} />
      </Field>
      <Field label="Classes processuais" required hint="whitelist do MVP" error={errors.class_codes}>
        <MultiCheck options={CLASS_CODES} value={data.class_codes || []} onChange={(v) => setData({ class_codes: v })} />
      </Field>
      <Field label="Palavras-chave" hint="enter ou vírgula · combinadas com OU" error={errors.keywords}>
        <TagsInput value={data.keywords || []} onChange={(v) => setData({ keywords: v })} placeholder="Ex.: professor, magistério, quintos" ariaLabel="Adicionar palavra-chave" />
      </Field>
      <label className="flex items-start gap-3 p-3 rounded-md border border-zinc-200 bg-zinc-50/50 cursor-pointer">
        <span className="mt-0.5">
          <span className={Utils.cx("relative inline-flex h-5 w-9 rounded-full transition-colors", data.against_state_only ? "bg-zinc-900" : "bg-zinc-300")}>
            <span className={Utils.cx("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
              data.against_state_only ? "translate-x-[18px]" : "translate-x-0.5")} />
          </span>
        </span>
        <div className="text-[12.5px]">
          <div className="font-medium text-zinc-900">Apenas processos contra o Estado</div>
          <div className="text-zinc-500 mt-0.5">Limita capturas a feitos com Fazenda Pública (federal, estadual ou municipal) no polo passivo.</div>
        </div>
        <input type="checkbox" className="sr-only" checked={!!data.against_state_only} onChange={(e) => setData({ against_state_only: e.target.checked })} />
      </label>
    </div>
  );
}

function validate(type, data) {
  const e: any = {};
  if (type === "person") {
    if (!data.full_name || data.full_name.trim().length < 3) e.full_name = "Mínimo 3 caracteres";
    if (data.cpf && !validateCPF(data.cpf)) e.cpf = "CPF inválido";
    if (data.oab && !/^[A-Z]{2}\d{4,6}$/.test(data.oab)) e.oab = "Formato UF000000";
  } else if (type === "process") {
    if (!validateCNJNumber(data.process_number || "")) e.process_number = "Número CNJ inválido (DV incorreto)";
  } else if (type === "radar") {
    if (!data.tribunal_aliases?.length) e.tribunal_aliases = "Selecione ao menos um tribunal";
    if (!data.class_codes?.length) e.class_codes = "Selecione ao menos uma classe";
  } else if (type === "lawyer") {
    return validateLawyer(data);
  }
  return e;
}

function ModalitiesPicker({ selected, onSelect, radarLimitReached, lawyerLimitReached }) {
  const items = [
    { id: "person",  emoji: "👤", title: "Monitorar uma pessoa", sub: "Cadastre um cliente, parte adversa ou pessoa de interesse — capture qualquer processo onde apareça." },
    { id: "process", emoji: "📄", title: "Monitorar um processo específico", sub: "Digite o número CNJ e o JusRadar busca dados e movimentações no DataJud, monitorando atualizações automaticamente." },
    { id: "lawyer",  emoji: "⚖️", title: "Monitorar um advogado (OAB)", sub: "Descubra automaticamente todos os processos do TJRJ em que o advogado figura como representante.", disabled: lawyerLimitReached, disabledMsg: "Limite de 3 advogados atingido" },
    { id: "radar",   emoji: "📡", title: "Criar um radar de captação", sub: "Quero descobrir novos casos por critério — tribunais, classes, palavras-chave.", disabled: radarLimitReached, disabledMsg: "Limite de 5 radares atingido" },
  ];
  return (
    <div className="grid gap-3">
      {items.map((it: any) => {
        const on = selected === it.id;
        const dis = it.disabled;
        return (
          <button key={it.id} onClick={() => !dis && onSelect(it.id)} aria-pressed={on} disabled={dis}
            className={Utils.cx(
              "relative text-left p-4 rounded-lg border-2 transition flex items-start gap-4",
              on ? "border-zinc-900 bg-zinc-900/[0.03]" : "border-zinc-200 hover:border-zinc-300 bg-white",
              dis && "opacity-50 cursor-not-allowed hover:border-zinc-200"
            )}>
            <span className="text-[28px] leading-none mt-0.5">{it.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="text-[14.5px] font-semibold text-zinc-900">{it.title}</div>
              <div className="text-[12.5px] text-zinc-600 mt-1">{it.sub}</div>
              {dis && <div className="text-[11.5px] text-amber-700 mt-1.5 inline-flex items-center gap-1"><Icon name="alert-circle" className="h-3 w-3" />{it.disabledMsg}</div>}
            </div>
            <span className={Utils.cx(
              "shrink-0 grid place-items-center h-5 w-5 rounded-full border-2 transition",
              on ? "bg-zinc-900 border-zinc-900 text-white" : "border-zinc-300"
            )}>
              {on && <Icon name="check" className="h-3 w-3" strokeWidth={3} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function TestPanel({ state, onRun }) {
  return (
    <div className="mt-6 rounded-lg border border-zinc-200 bg-zinc-50/40">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon name="sparkles" className="h-4 w-4 text-zinc-700" />
          <div>
            <div className="text-[13px] font-medium text-zinc-900">Testar antes de salvar</div>
            <div className="text-[11.5px] text-zinc-500">Simula a busca dos últimos 7 dias sem persistir o alvo.</div>
          </div>
        </div>
        <button onClick={onRun} disabled={state.loading}
          className="h-8 px-3 rounded-md border border-zinc-300 bg-white text-[12.5px] font-medium text-zinc-800 hover:bg-zinc-50 inline-flex items-center gap-1.5 disabled:opacity-60">
          {state.loading ? <Icon name="loader" className="h-3.5 w-3.5 animate-spin" /> : <Icon name="play" className="h-3 w-3" />}
          Executar teste
        </button>
      </div>
      {state.open && (
        <div className="border-t border-zinc-200 px-4 py-3">
          {state.loading && (
            <div className="text-[12.5px] text-zinc-500 inline-flex items-center gap-2">
              <Icon name="loader" className="h-3.5 w-3.5 animate-spin" /> Cruzando critério com 30 movimentações…
            </div>
          )}
          {state.error && (
            <div className="text-[12.5px] text-red-700 inline-flex items-center gap-2"><Icon name="alert-circle" className="h-3.5 w-3.5" /> {state.error}</div>
          )}
          {state.result && (
            <>
              {state.result.count === 0 ? (
                <div className="text-[12.5px] text-zinc-600">
                  Nenhum processo dos últimos 7 dias casaria com este critério. Considere relaxar tribunais ou palavras-chave.
                </div>
              ) : (
                <>
                  <div className="text-[13px] text-zinc-900">
                    Esse critério capturaria <span className="font-semibold">{state.result.count}</span> processo{state.result.count > 1 ? "s" : ""} publicado{state.result.count > 1 ? "s" : ""} nos últimos 7 dias.
                  </div>
                  <ul className="mt-2 divide-y divide-zinc-200 rounded-md border border-zinc-200 bg-white">
                    {state.result.samples.map((m) => (
                      <li key={m.id} className="px-3 py-2 flex items-center gap-3">
                        <span className="font-mono text-[11.5px] text-zinc-700 tabular-nums shrink-0">{m.numero}</span>
                        <span className="text-[12px] text-zinc-600 line-clamp-1 flex-1">{m.resumo}</span>
                        <span className="text-[11px] text-zinc-400 shrink-0">{m.tribunal}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CreateDrawer({ open, mode, initial, onClose, onSaved, radarLimitReached, lawyerLimitReached, testCriteria }) {
  const tribunais = TRIBUNAIS_SUPORTADOS;
  const isEdit = mode === "edit";
  const [step, setStep] = useState(isEdit ? 2 : 1);
  const [type, setType] = useState(initial?.type || null);
  const [drafts, setDrafts] = useState({ person: {}, process: {}, radar: {}, lawyer: { oab_numbers: [], include_inactive: false } });
  const [errors, setErrors] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [test, setTest] = useState<any>({ open: false, loading: false, result: null, error: null });
  const lawyerFormRef = useRef<LawyerTargetFormHandle | null>(null);

  useEffect(() => {
    if (!open) return;
    if (isEdit && initial) {
      setType(initial.type);
      setDrafts({ person: {}, process: {}, radar: {}, lawyer: { oab_numbers: [], include_inactive: false }, [initial.type]: { ...initial } } as any);
      setStep(2);
    } else {
      setType(null);
      setDrafts({ person: {}, process: {}, radar: {}, lawyer: { oab_numbers: [], include_inactive: false } });
      setErrors({});
      setStep(1);
    }
    setTest({ open: false, loading: false, result: null, error: null });
  }, [open, mode, initial?.id]);

  const data = type ? drafts[type] : {};
  const setData = (patch) => setDrafts((d) => ({ ...d, [type]: { ...d[type], ...patch } }));

  const onSave = async () => {
    let resolvedOabs: string[] | null = null;
    // Flush de OAB pendente no input antes de validar (evita race com onBlur/setState)
    if (type === "lawyer" && lawyerFormRef.current) {
      const r = lawyerFormRef.current.flushPending();
      if (!r.ok) {
        setErrors({ oab_numbers: "Confirme ou corrija a OAB digitada antes de salvar." });
        return;
      }
      resolvedOabs = r.oabs;
    }
    const current = type ? drafts[type] : {};
    const merged = type === "lawyer" && resolvedOabs
      ? { ...current, oab_numbers: resolvedOabs }
      : current;
    const e = validate(type, merged);
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    const payload = { ...merged, type };
    try { await onSaved(payload, isEdit ? initial.id : null); }
    finally { setSaving(false); }
  };

  const onTest = async () => {
    setTest({ open: true, loading: true, result: null, error: null });
    try {
      const result = await testCriteria({ ...data, type });
      setTest({ open: true, loading: false, result, error: null });
    } catch {
      setTest({ open: true, loading: false, result: null, error: "Falha ao testar critério" });
    }
  };

  const radarBlocked = !isEdit && ((type === "radar" && radarLimitReached) || (type === "lawyer" && lawyerLimitReached));
  if (!open) return null;
  const meta = type ? typeMeta[type] : null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-zinc-900/40" onClick={onClose} aria-hidden="true" />
      <aside role="dialog" aria-modal="true" aria-label={isEdit ? "Editar alvo" : "Novo alvo"}
        className="absolute right-0 top-0 h-full w-full md:w-[640px] bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 h-14 border-b border-zinc-200 shrink-0">
          <div className="flex items-center gap-2">
            {step === 2 && !isEdit && (
              <button onClick={() => setStep(1)} aria-label="Voltar"
                className="grid h-8 w-8 place-items-center rounded-md text-zinc-600 hover:bg-zinc-100">
                <Icon name="chevron-left" className="h-4 w-4" />
              </button>
            )}
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                {isEdit ? "Editar alvo" : `Novo alvo · passo ${step} de 2`}
              </div>
              <h2 className="font-display text-[18px] tracking-tight text-zinc-900">
                {step === 1 ? "O que você quer monitorar?" : meta ? `Configurar ${meta.label.toLowerCase()}` : ""}
              </h2>
            </div>
          </div>
          <button onClick={onClose} aria-label="Fechar"
            className="grid h-8 w-8 place-items-center rounded-md text-zinc-600 hover:bg-zinc-100">
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {step === 1 ? (
            <ModalitiesPicker selected={type} onSelect={setType} radarLimitReached={radarLimitReached} lawyerLimitReached={lawyerLimitReached} />
          ) : type === "process" && !isEdit ? (
            <ProcessNumberForm onBack={() => setStep(1)} onClose={onClose} />
          ) : (
            <>
              {type === "person"  && <PersonForm  data={data} setData={setData} errors={errors} />}
              {type === "process" && <ProcessForm data={data} setData={setData} errors={errors} tribunais={tribunais} />}
              {type === "radar"   && <RadarForm   data={data} setData={setData} errors={errors} tribunais={tribunais} />}
              {type === "lawyer"  && <LawyerTargetForm ref={lawyerFormRef} data={data} setData={setData} errors={errors} />}
              {(type === "person" || type === "radar") && (
                <TestPanel state={test} onRun={onTest} />
              )}
            </>
          )}
        </div>

        <div className="px-5 h-16 border-t border-zinc-200 flex items-center justify-between gap-3 shrink-0 bg-white">
          <div className="text-[11.5px] text-zinc-500">
            {step === 1 && type === "radar" && radarLimitReached && (
              <span className="inline-flex items-center gap-1 text-amber-700">
                <Icon name="alert-circle" className="h-3.5 w-3.5" /> Limite de 5 radares ativos atingido no MVP.
              </span>
            )}
            {step === 2 && isEdit && (
              <span className="text-zinc-400">Tipo do alvo não pode ser alterado em edição.</span>
            )}
          </div>
          {step === 1 ? (
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="h-9 px-3 rounded-md text-[13px] text-zinc-700 hover:bg-zinc-100">Cancelar</button>
              <button onClick={() => setStep(2)} disabled={!type || radarBlocked}
                className="h-9 px-4 rounded-md bg-zinc-900 text-white text-[13px] font-medium hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5">
                Continuar <Icon name="arrow-right" className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : type === "process" && !isEdit ? null : (
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="h-9 px-3 rounded-md text-[13px] text-zinc-700 hover:bg-zinc-100">Cancelar</button>
              <button onClick={onSave} disabled={saving}
                className="h-9 px-4 rounded-md bg-zinc-900 text-white text-[13px] font-medium hover:bg-zinc-800 disabled:opacity-50 inline-flex items-center gap-1.5">
                {saving ? <Icon name="loader" className="h-3.5 w-3.5 animate-spin" /> : <Icon name="save" className="h-3.5 w-3.5" />}
                {isEdit ? "Salvar alterações" : "Salvar alvo"}
              </button>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function RowKebab({ onEdit, onDuplicate, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<any>(null);
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button onClick={(e) => { e.stopPropagation(); setOpen((s) => !s); }} aria-label="Ações"
        className="grid h-7 w-7 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900">
        <Icon name="more-horizontal" className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-44 rounded-lg border border-zinc-200 bg-white shadow-lg p-1 text-[13px] z-10">
          <button onClick={(e) => { e.stopPropagation(); setOpen(false); onEdit(); }} className="w-full text-left px-2.5 py-1.5 rounded hover:bg-zinc-50 inline-flex items-center gap-2"><Icon name="edit" className="h-3.5 w-3.5" />Editar</button>
          <button onClick={(e) => { e.stopPropagation(); setOpen(false); onDuplicate(); }} className="w-full text-left px-2.5 py-1.5 rounded hover:bg-zinc-50 inline-flex items-center gap-2"><Icon name="copy" className="h-3.5 w-3.5" />Duplicar</button>
          <div className="h-px bg-zinc-100 my-1" />
          <button onClick={(e) => { e.stopPropagation(); setOpen(false); onDelete(); }} className="w-full text-left px-2.5 py-1.5 rounded hover:bg-red-50 text-red-600 inline-flex items-center gap-2"><Icon name="trash" className="h-3.5 w-3.5" />Excluir</button>
        </div>
      )}
    </div>
  );
}

function TargetRow({ t, onEdit, onDuplicate, onDelete, onToggle }) {
  const id = targetIdentifier(t);
  return (
    <tr onClick={onEdit} className="group cursor-pointer border-b border-zinc-100 hover:bg-zinc-50/70 transition">
      <td className="py-3 pl-4 pr-2 align-middle"><TypeBadge type={t.type} /></td>
      <td className="py-3 px-3 align-middle min-w-0">
        <div className="flex items-center gap-2">
          <div className={Utils.cx("text-[13px] text-zinc-900 truncate", id.mono && "font-mono tabular-nums")}>{id.primary}</div>
          {id.processCount !== undefined && t.type === 'lawyer' && (
            <span className="shrink-0 text-[10px] font-medium text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded-full">
              {id.processCount} processos
            </span>
          )}
        </div>
        {id.secondary && <div className="text-[11.5px] text-zinc-500 truncate mt-0.5">{id.secondary}</div>}
      </td>
      <td className="py-3 px-3 align-middle">
        <div className="flex items-center gap-2">
          <StatusToggle active={t.active} onToggle={onToggle} />
          <span className={Utils.cx("text-[11.5px]", t.active ? "text-zinc-700" : "text-zinc-400")}>{t.active ? "Ativo" : "Pausado"}</span>
        </div>
      </td>
      <td className="py-3 px-3 align-middle">
        <div className="flex items-center gap-3">
          <span className="text-[13px] tabular-nums text-zinc-900 font-medium w-8 text-right">{t.stats30d}</span>
          <span className={Utils.cx("text-zinc-400", t.active ? "" : "opacity-50")}><Sparkline values={t.sparkline} /></span>
        </div>
      </td>
      <td className="py-3 pr-4 pl-1 align-middle text-right w-1">
        <RowKebab onEdit={onEdit} onDuplicate={onDuplicate} onDelete={onDelete} />
      </td>
    </tr>
  );
}

function TargetCard({ t, onEdit, onDuplicate, onDelete, onToggle }) {
  const id = targetIdentifier(t);
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3" onClick={onEdit}>
      <div className="flex items-center justify-between gap-2">
        <TypeBadge type={t.type} />
        <RowKebab onEdit={onEdit} onDuplicate={onDuplicate} onDelete={onDelete} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className={Utils.cx("text-[13.5px] text-zinc-900 font-medium truncate", id.mono && "font-mono tabular-nums")}>{id.primary}</div>
        {id.processCount !== undefined && t.type === 'lawyer' && (
          <span className="shrink-0 text-[10px] font-medium text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded-full">
            {id.processCount}
          </span>
        )}
      </div>
      {id.secondary && <div className="text-[12px] text-zinc-500 mt-0.5">{id.secondary}</div>}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusToggle active={t.active} onToggle={onToggle} />
          <span className="text-[11.5px] text-zinc-600">{t.active ? "Ativo" : "Pausado"}</span>
        </div>
        <div className="flex items-center gap-2 text-zinc-400">
          <span className="text-[12px] text-zinc-700 tabular-nums">{t.stats30d}</span>
          <Sparkline values={t.sparkline} />
        </div>
      </div>
    </div>
  );
}

function EmptyState({ filter, onCreate }) {
  const labels: any = { todos: "Você ainda não tem monitoramentos", person: "Nenhuma pessoa monitorada", process: "Nenhum processo específico", radar: "Nenhum radar de captação", lawyer: "Nenhum advogado monitorado" };
  return (
    <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 p-12 text-center">
      <div className="grid place-items-center mx-auto h-12 w-12 rounded-full bg-white border border-zinc-200">
        <Icon name="target" className="h-6 w-6 text-zinc-400" />
      </div>
      <h3 className="mt-4 text-[15px] font-medium text-zinc-900">{labels[filter] || labels.todos}</h3>
      <p className="mt-1 text-[12.5px] text-zinc-500 max-w-sm mx-auto">
        Cadastre uma pessoa, advogado, um processo ou um radar de captação para o JusRadar começar a monitorar por você.
      </p>
      <button onClick={onCreate}
        className="mt-5 h-9 px-4 rounded-md bg-zinc-900 text-white text-[13px] font-medium hover:bg-zinc-800 inline-flex items-center gap-1.5">
        <Icon name="plus" className="h-4 w-4" /> Novo monitoramento
      </button>
    </div>
  );
}

function ConfirmDialog({ title, body, confirmLabel, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center px-4">
      <div className="absolute inset-0 bg-zinc-900/40" onClick={onCancel} />
      <div role="dialog" aria-modal="true" className="relative w-full max-w-sm rounded-lg bg-white shadow-xl border border-zinc-200 p-5">
        <h3 className="text-[15px] font-semibold text-zinc-900">{title}</h3>
        <div className="mt-2 text-[13px] text-zinc-600">{body}</div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button onClick={onCancel} className="h-9 px-3 rounded-md text-[13px] text-zinc-700 hover:bg-zinc-100">Cancelar</button>
          <button onClick={onConfirm} className="h-9 px-3.5 rounded-md bg-red-600 text-white text-[13px] font-medium hover:bg-red-700">{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

const LAWYER_LIMIT = 3;

export function Alvos() {
  const { items, counters, create, update, remove, toggle, duplicate, testCriteria } = useTargets();
  const [filter, setFilter] = useState("todos");
  const [drawer, setDrawer] = useState<any>({ open: false, mode: "create", initial: null });
  const [confirm, setConfirm] = useState<any>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    process: true,
    person: true,
    lawyer: true,
    radar: true
  });
  const navigate = useNavigate();
  const createLawyer = useServerFn(createLawyerTarget);

  const filtered = useMemo(() => {
    if (filter === "todos") return items;
    if (filter === "person") return items.filter((t) => t.type === "person" || t.type === "radar");
    return items.filter((t) => t.type === filter);
  }, [items, filter]);

  const radarLimitReached = counters.radar >= RADAR_LIMIT;
  const lawyerCount = (counters as any).lawyer ?? items.filter((t: any) => t.type === "lawyer").length;
  const lawyerLimitReached = lawyerCount >= LAWYER_LIMIT;

  const onSaved = async (payload, editId) => {
    if (payload.type === "lawyer" && !editId) {
      try {
        const res: any = await createLawyer({
          data: {
            lawyer_name: payload.lawyer_name,
            oab_numbers: payload.oab_numbers || [],
            include_inactive: !!payload.include_inactive,
          },
        });
        if (res?.error === "lawyer_target_limit_reached") {
          window.dispatchEvent(new CustomEvent("toast", { detail: { kind: "err", msg: `Limite de ${res.limit} advogados atingido` } }));
          return;
        }
        if (res?.error === "oab_already_monitored") {
          window.dispatchEvent(new CustomEvent("toast", { detail: { kind: "err", msg: "Uma das OABs já está sendo monitorada" } }));
          return;
        }
        if (res?.error === "invalid_oabs") {
          window.dispatchEvent(new CustomEvent("toast", { detail: { kind: "err", msg: `OAB inválida: ${res.invalid.join(", ")}` } }));
          return;
        }
        if (res?.ok && res.target?.id) {
          setDrawer({ open: false, mode: "create", initial: null });
          window.dispatchEvent(new CustomEvent("toast", { detail: { kind: "ok", msg: "Advogado criado · iniciando descoberta" } }));
          navigate({ to: "/alvos/$targetId/descoberta", params: { targetId: res.target.id } });
          return;
        }
        window.dispatchEvent(new CustomEvent("toast", { detail: { kind: "err", msg: "Falha ao criar alvo" } }));
      } catch (e: any) {
        window.dispatchEvent(new CustomEvent("toast", { detail: { kind: "err", msg: String(e?.message || e) } }));
      }
      return;
    }
    if (editId) await update(editId, payload);
    else await create(payload);
    setDrawer({ open: false, mode: "create", initial: null });
    window.dispatchEvent(new CustomEvent("toast", { detail: { kind: "ok", msg: editId ? "Alvo atualizado" : "Alvo criado" } }));
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Monitoramento</div>
          <h1 className="font-display text-2xl md:text-[28px] tracking-tight text-zinc-900">Configuração de Monitoramento</h1>
          <p className="text-[13.5px] text-zinc-600 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-medium text-[12px] border border-indigo-100">
              <Icon name="search" className="h-3 w-3" />
              {counters.person + counters.lawyer + counters.radar} fontes de busca
            </span>
            <span className="text-zinc-300">·</span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 font-medium text-[12px] border border-sky-100">
              <Icon name="file-text" className="h-3 w-3" />
              {counters.process} processos diretos
            </span>
            <span className="text-zinc-300">·</span>
            <span className={Utils.cx("text-zinc-500 text-[12px]", radarLimitReached && "text-amber-700 font-medium")}>
              {counters.radar}/{RADAR_LIMIT} radares ativos
            </span>
          </p>
        </div>
        <button onClick={() => setDrawer({ open: true, mode: "create", initial: null })}
          className="h-9 px-3.5 rounded-md bg-zinc-900 text-white text-[13px] font-medium hover:bg-zinc-800 inline-flex items-center gap-1.5">
          <Icon name="plus" className="h-4 w-4" /> Novo monitoramento
        </button>
      </div>

      <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 mb-6 flex items-start gap-3">
        <div className="mt-0.5 grid h-5 w-5 place-items-center rounded-full bg-amber-100 text-amber-700">
          <Icon name="info" className="h-3.5 w-3.5" />
        </div>
        <div>
          <h4 className="text-[13px] font-semibold text-amber-900">Entenda seus alvos</h4>
          <p className="text-[12.5px] text-amber-800/80 leading-relaxed mt-0.5">
            <strong>Fontes de busca</strong> (CPF, OAB e Radares) são critérios usados para descobrir novos processos automaticamente. 
            <strong> Processos diretos</strong> são monitorados pelo número CNJ específico.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {[
          { id: "todos",   label: "Todos",     n: counters.total },
          { id: "lawyer",  label: "Advogados (OAB)", n: counters.lawyer },
          { id: "person",  label: "Pessoas / CPF",   n: counters.person + counters.radar },
          { id: "process", label: "Processos (CNJ)", n: counters.process },
        ].map((c) => (
          <button key={c.id} onClick={() => setFilter(c.id)} aria-pressed={filter === c.id}
            className={Utils.cx(
              "inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-[12.5px] font-medium transition",
              filter === c.id ? "bg-zinc-900 border-zinc-900 text-white"
                               : "bg-white border-zinc-200 text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
            )}>
            {c.label}
            <span className={Utils.cx(
              "tabular-nums text-[10.5px] px-1 rounded",
              filter === c.id ? "bg-white/15 text-white" : "bg-zinc-100 text-zinc-600"
            )}>{c.n}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState filter={filter} onCreate={() => setDrawer({ open: true, mode: "create", initial: null })} />
      ) : filter !== "todos" ? (
        <>
          <div className="hidden lg:block rounded-lg border border-zinc-200 bg-white overflow-hidden max-h-[600px] overflow-y-auto custom-scrollbar">
            <table className="w-full text-left">
              <thead className="bg-zinc-50/60 border-b border-zinc-200">
                <tr className="text-[10.5px] font-semibold uppercase tracking-wider text-zinc-500">
                  <th className="py-2.5 pl-4 pr-2 w-32">Tipo</th>
                  <th className="py-2.5 px-3">Identificador</th>
                  <th className="py-2.5 px-3 w-40">Status</th>
                  <th className="py-2.5 px-3 w-44">Movimentações 30d</th>
                  <th className="py-2.5 pr-4 pl-1 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <TargetRow key={t.id} t={t}
                    onEdit={() => setDrawer({ open: true, mode: "edit", initial: t })}
                    onDuplicate={() => duplicate(t.id)}
                    onDelete={() => setConfirm({ id: t.id, name: targetIdentifier(t).primary })}
                    onToggle={() => toggle(t.id)} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="lg:hidden grid gap-2 max-h-[600px] overflow-y-auto pr-1">
            {filtered.map((t) => (
              <TargetCard key={t.id} t={t}
                onEdit={() => setDrawer({ open: true, mode: "edit", initial: t })}
                onDuplicate={() => duplicate(t.id)}
                onDelete={() => setConfirm({ id: t.id, name: targetIdentifier(t).primary })}
                onToggle={() => toggle(t.id)} />
            ))}
          </div>
        </>
      ) : (
        <div className="space-y-8">
          <div>
            <div className="flex items-center gap-2 px-1 mb-4">
              <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">Fontes de Descoberta</span>
              <div className="h-px flex-1 bg-zinc-100" />
            </div>
            <div className="space-y-4">
              {[
                { id: "lawyer",  ids: ["lawyer"], label: "Advogados (OAB)", emoji: "⚖️", sub: "Monitora automaticamente novos processos vinculados a estas OABs." },
                { id: "person",  ids: ["person", "radar"], label: "Pessoas / CPF", emoji: "👤", sub: "Busca novos processos onde estas pessoas figuram como parte." },
              ].map((group) => {
                const groupItems = items.filter(t => group.ids.includes(t.type));
                const isExpanded = expandedGroups[group.id];

                return (
                  <section key={group.id} className="bg-white rounded-xl border border-zinc-200 overflow-hidden transition-all shadow-sm">
                    <button
                      onClick={() => setExpandedGroups(prev => ({ ...prev, [group.id]: !prev[group.id] }))}
                      className="w-full text-left px-4 py-3.5 flex items-center justify-between hover:bg-zinc-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{group.emoji}</span>
                        <div>
                          <h2 className="text-[14px] font-semibold text-zinc-800 flex items-center gap-2">
                            {group.label}
                            <span className="text-zinc-400 font-normal bg-zinc-100 px-1.5 py-0.5 rounded text-[11px]">
                              {groupItems.length}
                            </span>
                          </h2>
                          <p className="text-[11.5px] text-zinc-500 font-normal">{group.sub}</p>
                        </div>
                      </div>
                      <div className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                        <Icon name="chevron-down" className="h-4 w-4 text-zinc-400" />
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-zinc-100 max-h-[400px] overflow-y-auto custom-scrollbar">
                        {groupItems.length === 0 ? (
                          <div className="p-8 text-center text-zinc-400 text-[13px]">
                            Nenhuma fonte de busca cadastrada.
                          </div>
                        ) : (
                          <>
                            <div className="hidden lg:block overflow-hidden">
                              <table className="w-full text-left">
                                <thead className="bg-zinc-50/30 border-b border-zinc-100">
                                  <tr className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                                    <th className="py-2 pl-4 pr-2 w-32">Tipo</th>
                                    <th className="py-2 px-3">Identificador</th>
                                    <th className="py-2 px-3 w-40">Status</th>
                                    <th className="py-2 px-3 w-44">Movimentações 30d</th>
                                    <th className="py-2 pr-4 pl-1 w-12"></th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-100">
                                  {groupItems.map((t) => (
                                    <TargetRow key={t.id} t={t}
                                      onEdit={() => setDrawer({ open: true, mode: "edit", initial: t })}
                                      onDuplicate={() => duplicate(t.id)}
                                      onDelete={() => setConfirm({ id: t.id, name: targetIdentifier(t).primary })}
                                      onToggle={() => toggle(t.id)} />
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <div className="lg:hidden p-3 grid gap-2">
                              {groupItems.map((t) => (
                                <TargetCard key={t.id} t={t}
                                  onEdit={() => setDrawer({ open: true, mode: "edit", initial: t })}
                                  onDuplicate={() => duplicate(t.id)}
                                  onDelete={() => setConfirm({ id: t.id, name: targetIdentifier(t).primary })}
                                  onToggle={() => toggle(t.id)} />
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 px-1 mb-4">
              <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">Monitoramento Direto</span>
              <div className="h-px flex-1 bg-zinc-100" />
            </div>
            <div className="space-y-4">
              {[
                { id: "process", ids: ["process"], label: "Processos (CNJ)", emoji: "📄", sub: "Monitora atualizações e novas movimentações de números CNJ específicos." },
              ].map((group) => {
                const groupItems = items.filter(t => group.ids.includes(t.type));
                const isExpanded = expandedGroups[group.id];

                return (
                  <section key={group.id} className="bg-white rounded-xl border border-zinc-200 overflow-hidden transition-all shadow-sm">
                    <button
                      onClick={() => setExpandedGroups(prev => ({ ...prev, [group.id]: !prev[group.id] }))}
                      className="w-full text-left px-4 py-3.5 flex items-center justify-between hover:bg-zinc-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{group.emoji}</span>
                        <div>
                          <h2 className="text-[14px] font-semibold text-zinc-800 flex items-center gap-2">
                            {group.label}
                            <span className="text-zinc-400 font-normal bg-zinc-100 px-1.5 py-0.5 rounded text-[11px]">
                              {groupItems.length}
                            </span>
                          </h2>
                          <p className="text-[11.5px] text-zinc-500 font-normal">{group.sub}</p>
                        </div>
                      </div>
                      <div className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                        <Icon name="chevron-down" className="h-4 w-4 text-zinc-400" />
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-zinc-100 max-h-[400px] overflow-y-auto custom-scrollbar">
                        {groupItems.length === 0 ? (
                          <div className="p-8 text-center text-zinc-400 text-[13px]">
                            Nenhum processo cadastrado para monitoramento direto.
                          </div>
                        ) : (
                          <>
                            <div className="hidden lg:block overflow-hidden">
                              <table className="w-full text-left">
                                <thead className="bg-zinc-50/30 border-b border-zinc-100">
                                  <tr className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                                    <th className="py-2 pl-4 pr-2 w-32">Tipo</th>
                                    <th className="py-2 px-3">Identificador</th>
                                    <th className="py-2 px-3 w-40">Status</th>
                                    <th className="py-2 px-3 w-44">Movimentações 30d</th>
                                    <th className="py-2 pr-4 pl-1 w-12"></th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-100">
                                  {groupItems.map((t) => (
                                    <TargetRow key={t.id} t={t}
                                      onEdit={() => setDrawer({ open: true, mode: "edit", initial: t })}
                                      onDuplicate={() => duplicate(t.id)}
                                      onDelete={() => setConfirm({ id: t.id, name: targetIdentifier(t).primary })}
                                      onToggle={() => toggle(t.id)} />
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <div className="lg:hidden p-3 grid gap-2">
                              {groupItems.map((t) => (
                                <TargetCard key={t.id} t={t}
                                  onEdit={() => setDrawer({ open: true, mode: "edit", initial: t })}
                                  onDuplicate={() => duplicate(t.id)}
                                  onDelete={() => setConfirm({ id: t.id, name: targetIdentifier(t).primary })}
                                  onToggle={() => toggle(t.id)} />
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      )
    }

      <CreateDrawer
        open={drawer.open}
        mode={drawer.mode}
        initial={drawer.initial}
        radarLimitReached={radarLimitReached}
        lawyerLimitReached={lawyerLimitReached}
        onClose={() => setDrawer({ open: false, mode: "create", initial: null })}
        onSaved={onSaved}
        testCriteria={testCriteria}
      />

      {confirm && (
        <ConfirmDialog
          title="Excluir alvo?"
          body={<>Você está prestes a excluir <span className="font-medium text-zinc-900">{confirm.name}</span>. Esta ação não pode ser desfeita — o histórico de capturas associado a este alvo será preservado.</>}
          confirmLabel="Excluir alvo"
          onCancel={() => setConfirm(null)}
          onConfirm={async () => { await remove(confirm.id); setConfirm(null);
            window.dispatchEvent(new CustomEvent("toast", { detail: { kind: "ok", msg: "Alvo excluído" } })); }}
        />
      )}
    </div>
  );
}
export default Alvos;
