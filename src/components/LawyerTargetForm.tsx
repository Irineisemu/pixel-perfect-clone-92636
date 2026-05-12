import { forwardRef, useImperativeHandle, useRef } from "react";
import { OABInput, OABInputHandle } from "./OABInput";
import { Icon } from "./Icon";

interface LawyerFormData {
  lawyer_name?: string;
  oab_numbers?: string[];
  include_inactive?: boolean;
}

interface Props {
  data: LawyerFormData;
  setData: (patch: Partial<LawyerFormData>) => void;
  errors: Record<string, string>;
}

export interface LawyerTargetFormHandle {
  /** Confirma OAB digitada e retorna lista resolvida (já propagada via setData). */
  flushPending: () => { ok: boolean; oabs: string[] };
}

const Field = ({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) => (
  <div>
    <label className="flex items-center justify-between text-[11.5px] font-medium uppercase tracking-wide text-zinc-600">
      <span>
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {hint && (
        <span className="text-[10.5px] text-zinc-400 normal-case font-normal tracking-normal">
          {hint}
        </span>
      )}
    </label>
    <div className="mt-1.5">{children}</div>
    {error && (
      <div
        role="alert"
        aria-live="polite"
        className="mt-1 text-[11.5px] text-red-600 inline-flex items-center gap-1"
      >
        <Icon name="alert-circle" className="h-3 w-3" />
        {error}
      </div>
    )}
  </div>
);

export const LawyerTargetForm = forwardRef<LawyerTargetFormHandle, Props>(
  function LawyerTargetForm({ data, setData, errors }, ref) {
    const oabRef = useRef<OABInputHandle | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        flushPending: () => {
          const r = oabRef.current?.flushDraft();
          return r ?? { ok: true, oabs: data.oab_numbers || [] };
        },
      }),
      [data.oab_numbers],
    );

    return (
      <div className="grid gap-4">
        <div className="rounded-md border border-indigo-100 bg-indigo-50/50 p-3 flex items-start gap-2.5">
          <span className="text-[18px] leading-none">⚖️</span>
          <div className="text-[12.5px] text-indigo-900">
            <div className="font-medium">Descoberta automática por OAB</div>
            <div className="text-indigo-800/80 mt-0.5">
              O JusRadar buscará no DataJud todos os processos do TJRJ em que pelo
              menos uma das OABs informadas figure como representante. A primeira
              descoberta pode levar alguns minutos.
            </div>
          </div>
        </div>

        <Field label="Nome do advogado" required error={errors.lawyer_name}>
          <input
            value={data.lawyer_name || ""}
            onChange={(e) => setData({ lawyer_name: e.target.value })}
            placeholder="Ex.: Dr. João Silva"
            className={
              "w-full h-9 px-2.5 rounded-md border bg-white text-[13px] focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 " +
              (errors.lawyer_name ? "border-red-300" : "border-zinc-200")
            }
          />
        </Field>

        <Field
          label="OABs"
          hint="até 10 inscrições · UF + número (sem pontos)"
          required
          error={errors.oab_numbers}
        >
          <OABInput
            ref={oabRef}
            value={data.oab_numbers || []}
            onChange={(v) => setData({ oab_numbers: v })}
            max={10}
            error={errors.oab_numbers}
          />
        </Field>

        <label className="flex items-start gap-3 p-3 rounded-md border border-zinc-200 bg-zinc-50/50 cursor-pointer">
          <span className="mt-0.5">
            <span
              className={
                "relative inline-flex h-5 w-9 rounded-full transition-colors " +
                (data.include_inactive ? "bg-zinc-900" : "bg-zinc-300")
              }
            >
              <span
                className={
                  "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform " +
                  (data.include_inactive ? "translate-x-[18px]" : "translate-x-0.5")
                }
              />
            </span>
          </span>
          <div className="text-[12.5px]">
            <div className="font-medium text-zinc-900">
              Incluir processos arquivados/baixados
            </div>
            <div className="text-zinc-500 mt-0.5">
              Por padrão, apenas processos ativos são considerados na descoberta.
            </div>
          </div>
          <input
            type="checkbox"
            className="sr-only"
            checked={!!data.include_inactive}
            onChange={(e) => setData({ include_inactive: e.target.checked })}
          />
        </label>

        <div className="text-[11.5px] text-zinc-500 inline-flex items-center gap-1.5">
          <Icon name="info" className="h-3.5 w-3.5" />
          Tribunal monitorado no MVP: <span className="font-medium text-zinc-700">TJRJ</span>.
        </div>
      </div>
    );
  },
);

export function validateLawyer(data: LawyerFormData): Record<string, string> {
  const e: Record<string, string> = {};
  const name = (data.lawyer_name || "").trim();
  if (name.length < 3) e.lawyer_name = "Mínimo 3 caracteres";
  if (!data.oab_numbers || data.oab_numbers.length === 0)
    e.oab_numbers = "Adicione ao menos 1 OAB";
  return e;
}
