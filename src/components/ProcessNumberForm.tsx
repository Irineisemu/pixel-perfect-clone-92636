// @ts-nocheck
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { createProcessTargets } from "@/lib/process.functions";

interface Props {
  onSuccess?: (results: any[]) => void;
  onBack?: () => void;
  onClose?: () => void;
}

function formatDisplay(digits: string): string {
  if (digits.length === 20) {
    return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(13, 14)}.${digits.slice(14, 16)}.${digits.slice(16, 20)}`;
  }
  return digits;
}

export function ProcessNumberForm({ onSuccess, onBack, onClose }: Props) {
  const navigate = useNavigate();
  const createFn = useServerFn(createProcessTargets);

  const [inputValue, setInputValue] = useState("");
  const [numbers, setNumbers] = useState<string[]>([]);
  const [nickname, setNickname] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);

  const tryAdd = (raw: string) => {
    const clean = raw.trim();
    if (!clean) return;
    const digits = clean.replace(/\D/g, "");
    if (digits.length < 15 || digits.length > 25) {
      setInputError("Número inválido. Ex: 0001234-56.2024.8.19.0001");
      return;
    }
    if (numbers.includes(digits)) {
      setInputError("Este número já foi adicionado.");
      return;
    }
    if (numbers.length >= 20) {
      setInputError("Limite de 20 processos por vez.");
      return;
    }
    setNumbers((prev) => [...prev, digits]);
    setInputValue("");
    setInputError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === "Tab" || e.key === ",") {
      e.preventDefault();
      tryAdd(inputValue);
    } else if (e.key === "Backspace" && inputValue === "" && numbers.length > 0) {
      setNumbers((prev) => prev.slice(0, -1));
    }
  };

  const handleSubmit = async () => {
    let finalNumbers = numbers;
    if (inputValue.trim()) {
      const digits = inputValue.replace(/\D/g, "");
      if (digits.length >= 15 && digits.length <= 25 && !numbers.includes(digits)) {
        finalNumbers = [...numbers, digits];
        setNumbers(finalNumbers);
        setInputValue("");
      } else {
        setInputError("Confirme ou corrija o número antes de salvar.");
        return;
      }
    }

    if (finalNumbers.length === 0) {
      setError("Adicione ao menos um número de processo.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result: any = await createFn({
        data: { processNumbers: finalNumbers, nickname: nickname || undefined },
      });
      const results = result.results || [];
      const queued = results.filter((r: any) => r.status === "queued").length;
      const dup = results.filter((r: any) => r.status === "duplicate").length;
      const inv = results.filter((r: any) => r.status === "invalid").length;

      if (queued > 0) {
        toast.success(`${queued} processo${queued > 1 ? "s" : ""} adicionado${queued > 1 ? "s" : ""} ao monitoramento.`);
      }
      if (dup > 0) toast(`${dup} processo${dup > 1 ? "s" : ""} já estava${dup > 1 ? "m" : ""} sendo monitorado${dup > 1 ? "s" : ""}.`);
      if (inv > 0) toast.error(`${inv} número${inv > 1 ? "s" : ""} inválido${inv > 1 ? "s" : ""}.`);

      onSuccess?.(results);

      if (queued > 0) {
        onClose?.();
        navigate({ to: "/" });
      }
    } catch (err: any) {
      setError(err?.message || "Erro ao cadastrar processos. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-[13px] font-medium text-zinc-700 mb-1.5">
          Número(s) do processo <span className="text-rose-600">*</span>
        </label>
        <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border border-zinc-300 rounded-md bg-white min-h-[44px] focus-within:ring-2 focus-within:ring-zinc-400">
          {numbers.map((n) => (
            <span
              key={n}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-[12px] text-blue-800 font-mono"
            >
              {formatDisplay(n)}
              <button
                type="button"
                onClick={() => setNumbers((prev) => prev.filter((x) => x !== n))}
                className="text-blue-600 hover:text-blue-900 ml-0.5"
                aria-label={`Remover ${n}`}
              >
                ×
              </button>
            </span>
          ))}
          <input
            type="text"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              setInputError(null);
            }}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              if (inputValue.trim()) tryAdd(inputValue);
            }}
            placeholder={
              numbers.length === 0
                ? "Ex: 0001234-56.2024.8.19.0001 (Enter para confirmar)"
                : "Adicionar outro processo..."
            }
            className="flex-1 min-w-[260px] outline-none bg-transparent text-[13px]"
          />
        </div>
        {inputError && <p className="mt-1 text-[12px] text-rose-600">{inputError}</p>}
        <p className="mt-1 text-[11.5px] text-zinc-500">
          Pressione Enter após cada número. Até 20 processos por vez.
        </p>
      </div>

      <div>
        <label className="block text-[13px] font-medium text-zinc-700 mb-1.5">
          Apelido (opcional)
        </label>
        <input
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="Ex: Ação de cobrança - João Silva"
          className="w-full px-3 py-2 border border-zinc-300 rounded-md text-[13px]"
        />
      </div>

      <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2.5 text-[12px] text-blue-900">
        <strong>O que acontece:</strong> O JusRadar busca imediatamente os dados e movimentações
        de cada processo no DataJud. Depois, verifica novos movimentos a cada 30 minutos e te
        notifica conforme suas configurações.
      </div>

      {error && (
        <div className="rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-[12px] text-rose-800">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="px-3 py-2 rounded-md border border-zinc-300 text-[13px] text-zinc-700 hover:bg-zinc-50"
          >
            Voltar
          </button>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="px-4 py-2 rounded-md bg-zinc-900 text-white text-[13px] font-medium hover:bg-zinc-800 disabled:opacity-50"
        >
          {submitting
            ? "Salvando…"
            : `Monitorar ${numbers.length > 0 ? numbers.length + " " : ""}processo${numbers.length !== 1 ? "s" : ""}`}
        </button>
      </div>
    </div>
  );
}

export default ProcessNumberForm;
