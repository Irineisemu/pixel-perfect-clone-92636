import { useState, KeyboardEvent } from "react";
import { Icon } from "./Icon";
import {
  isValidOAB,
  normalizeOAB,
  formatOABDisplay,
  OAB_REGEX,
} from "../types/targets";

interface OABInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;
  ariaLabel?: string;
  error?: string;
}

/**
 * Tag-based OAB input.
 * Validates each entry against ^[A-Z]{2}\d{3,7}$ after normalization.
 * Accepts comma, space, Enter or paste-with-multiple as separators.
 */
export function OABInput({
  value,
  onChange,
  max = 10,
  ariaLabel = "Adicionar OAB",
  error,
}: OABInputProps) {
  const [draft, setDraft] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const tags = value || [];

  const tryAdd = (raw: string): boolean => {
    const norm = normalizeOAB(raw);
    if (!norm) return false;
    if (!OAB_REGEX.test(norm)) {
      setLocalError(`OAB inválida: "${raw}". Use o formato UF + número (ex.: SP145220).`);
      return false;
    }
    if (tags.includes(norm)) {
      setLocalError(`OAB ${formatOABDisplay(norm)} já adicionada.`);
      return false;
    }
    if (tags.length >= max) {
      setLocalError(`Máximo de ${max} OABs por advogado.`);
      return false;
    }
    onChange([...tags, norm]);
    setLocalError(null);
    return true;
  };

  const commit = () => {
    if (!draft.trim()) return;
    // Suporta múltiplos colados separados por vírgula/espaço/quebra
    const parts = draft.split(/[\s,;\n]+/).filter(Boolean);
    let allOk = true;
    for (const p of parts) {
      if (!tryAdd(p)) allOk = false;
    }
    if (allOk) setDraft("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && !draft && tags.length) {
      onChange(tags.slice(0, -1));
      setLocalError(null);
    }
  };

  const remove = (oab: string) => {
    onChange(tags.filter((t) => t !== oab));
    setLocalError(null);
  };

  const showError = error || localError;

  return (
    <div>
      <div
        className={
          "min-h-[40px] w-full flex flex-wrap items-center gap-1.5 px-2 py-1.5 rounded-md border bg-white focus-within:ring-2 focus-within:ring-zinc-900/10 focus-within:border-zinc-400 " +
          (showError ? "border-red-300" : "border-zinc-200")
        }
      >
        {tags.map((oab) => (
          <span
            key={oab}
            className="inline-flex items-center gap-1 h-7 px-2 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[12px] font-medium tabular-nums"
          >
            {formatOABDisplay(oab)}
            <button
              type="button"
              onClick={() => remove(oab)}
              aria-label={`Remover ${formatOABDisplay(oab)}`}
              className="text-indigo-500 hover:text-indigo-900"
            >
              <Icon name="x" className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value.toUpperCase());
            setLocalError(null);
          }}
          onKeyDown={onKeyDown}
          onBlur={commit}
          aria-label={ariaLabel}
          placeholder={tags.length ? "" : "Ex.: SP145220, RJ087410"}
          className="flex-1 min-w-[140px] h-7 px-1 bg-transparent outline-none text-[13px] uppercase placeholder:text-zinc-400 placeholder:normal-case"
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px]">
        <span className="text-zinc-400">
          {tags.length}/{max} OAB{tags.length !== 1 ? "s" : ""} · Enter ou vírgula para adicionar
        </span>
        {showError && (
          <span role="alert" className="text-red-600 inline-flex items-center gap-1">
            <Icon name="alert-circle" className="h-3 w-3" />
            {showError}
          </span>
        )}
      </div>
    </div>
  );
}

export { isValidOAB, normalizeOAB, formatOABDisplay };
