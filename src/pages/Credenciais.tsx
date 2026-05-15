// @ts-nocheck
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { z } from "zod";
import {
  listCredentials,
  upsertCredential,
  deleteCredential,
  testCredential,
  getCredentialStatus,
} from "../lib/credentials.functions";

const TRIBUNAIS = [
  { value: "tjrj", label: "TJRJ — Rio de Janeiro" },
  { value: "tjsp", label: "TJSP — São Paulo" },
];

const inputCx =
  "w-full h-9 px-2.5 rounded-md border border-zinc-200 bg-white text-[13px] focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/10";

const schema = z.object({
  tribunal: z.enum(["tjrj", "tjsp"]),
  oabNumber: z.string().regex(/^\d{1,7}$/, "Apenas números, até 7 dígitos"),
  oabUf: z.string().regex(/^[A-Za-z]{2}$/, "Use 2 letras"),
  password: z.string().min(4, "Mínimo 4 caracteres").max(200),
});

function statusPill(s: string | null) {
  if (s === "ok") return <span className="text-[11.5px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">Validada</span>;
  if (s === "failed") return <span className="text-[11.5px] px-1.5 py-0.5 rounded bg-red-50 text-red-700">Credenciais inválidas</span>;
  if (s === "captcha") return <span className="text-[11.5px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800">Captcha exigido</span>;
  if (s === "testing") return <span className="text-[11.5px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">Testando…</span>;
  return <span className="text-[11.5px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600">Não testada</span>;
}

export function Credenciais() {
  const list = useServerFn(listCredentials);
  const upsert = useServerFn(upsertCredential);
  const del = useServerFn(deleteCredential);
  const test = useServerFn(testCredential);
  const getStatus = useServerFn(getCredentialStatus);

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ tribunal: "tjrj", oabNumber: "", oabUf: "RJ", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<Record<string, string | null>>({}); // credId -> jobId
  const pollers = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  useEffect(() => () => { Object.values(pollers.current).forEach(clearInterval); }, []);

  const refresh = async () => {
    setLoading(true);
    try {
      setItems(await list());
    } catch (e: any) {
      toast.error("Erro ao carregar credenciais", { description: e.message });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.issues.forEach((i) => { errs[i.path[0] as string] = i.message; });
      setErrors(errs);
      return;
    }
    setSaving(true);
    try {
      await upsert({ data: parsed.data });
      toast.success("Credencial salva");
      setForm({ ...form, password: "" });
      refresh();
    } catch (e: any) {
      toast.error("Erro ao salvar", { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const runTest = async (credId: string) => {
    if (testing[credId]) return;
    try {
      const res = await test({ data: { id: credId } });
      const jobId = (res as any).jobId as string;
      setTesting((t) => ({ ...t, [credId]: jobId }));
      setItems((it) => it.map((c) => (c.id === credId ? { ...c, last_validation_status: "testing", last_validation_error: null } : c)));
      toast.message("Teste iniciado", { description: "Validando login no PJe…" });

      const startedAt = Date.now();
      pollers.current[credId] = setInterval(async () => {
        try {
          const row = await getStatus({ data: { id: credId } });
          if (!row) return;
          const s = row.last_validation_status;
          const elapsed = Date.now() - startedAt;
          if (s && s !== "testing") {
            clearInterval(pollers.current[credId]);
            delete pollers.current[credId];
            setTesting((t) => { const n = { ...t }; delete n[credId]; return n; });
            setItems((it) => it.map((c) => (c.id === credId ? { ...c, ...row } : c)));
            if (s === "ok") toast.success("Credencial validada", { description: "Login no PJe funcionou." });
            else if (s === "captcha") toast.warning("Captcha exigido pelo PJe", { description: row.last_validation_error ?? undefined });
            else toast.error("Falha na validação", { description: row.last_validation_error ?? "Verifique OAB e senha." });
          } else if (elapsed > 120_000) {
            clearInterval(pollers.current[credId]);
            delete pollers.current[credId];
            setTesting((t) => { const n = { ...t }; delete n[credId]; return n; });
            toast.error("Timeout", { description: "O worker demorou demais. Veja o job em /jobs." });
          }
        } catch { /* ignora glitch de polling */ }
      }, 3000);
    } catch (e: any) {
      toast.error("Erro ao iniciar teste", { description: e.message });
    }
  };

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl tracking-tight text-zinc-900">Credenciais OAB</h1>
        <p className="text-[13.5px] text-zinc-500 mt-1">
          Cadastre seu login do PJe para que o JusRadar acesse processos sigilosos e de 1º grau no seu nome.
          A senha é criptografada no servidor e nunca é exibida.
        </p>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white mb-6">
        <header className="px-5 py-3.5 border-b border-zinc-100">
          <h2 className="text-[14px] font-semibold text-zinc-900">Adicionar / atualizar</h2>
        </header>
        <form onSubmit={onSubmit} className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block sm:col-span-2">
            <span className="text-[12px] font-medium text-zinc-700">Tribunal</span>
            <select className={inputCx + " mt-1.5"} value={form.tribunal}
              onChange={(e) => setForm({ ...form, tribunal: e.target.value })}>
              {TRIBUNAIS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-[12px] font-medium text-zinc-700">Número da OAB</span>
            <input className={inputCx + " mt-1.5"} value={form.oabNumber}
              onChange={(e) => setForm({ ...form, oabNumber: e.target.value.replace(/\D/g, "") })}
              placeholder="123456" inputMode="numeric" />
            {errors.oabNumber && <span className="text-[11.5px] text-red-600">{errors.oabNumber}</span>}
          </label>
          <label className="block">
            <span className="text-[12px] font-medium text-zinc-700">UF</span>
            <input className={inputCx + " mt-1.5 uppercase"} value={form.oabUf} maxLength={2}
              onChange={(e) => setForm({ ...form, oabUf: e.target.value.toUpperCase() })} placeholder="RJ" />
            {errors.oabUf && <span className="text-[11.5px] text-red-600">{errors.oabUf}</span>}
          </label>
          <label className="block sm:col-span-2">
            <span className="text-[12px] font-medium text-zinc-700">Senha do PJe</span>
            <input type="password" className={inputCx + " mt-1.5"} value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
            {errors.password && <span className="text-[11.5px] text-red-600">{errors.password}</span>}
          </label>
          <div className="sm:col-span-2 flex justify-end">
            <button type="submit" disabled={saving}
              className="h-9 px-3.5 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white text-[13px] font-medium disabled:opacity-60">
              {saving ? "Salvando…" : "Salvar credencial"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white">
        <header className="px-5 py-3.5 border-b border-zinc-100 flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-zinc-900">Cadastradas</h2>
          <button onClick={refresh} className="text-[12px] text-zinc-600 hover:text-zinc-900">Atualizar</button>
        </header>
        {loading ? (
          <div className="p-6 text-[13px] text-zinc-500">Carregando…</div>
        ) : items.length === 0 ? (
          <div className="p-6 text-[13px] text-zinc-500">Nenhuma credencial cadastrada.</div>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {items.map((c) => (
              <li key={c.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[13px] font-medium text-zinc-900">
                    {c.tribunal_alias.toUpperCase()} · OAB/{c.oab_uf} {c.oab_number}
                  </div>
                  <div className="text-[11.5px] text-zinc-500 mt-0.5 flex items-center gap-2">
                    {statusPill(c.last_validation_status)}
                    {c.last_validated_at && (
                      <span>testada {new Date(c.last_validated_at).toLocaleString("pt-BR")}</span>
                    )}
                    {c.last_validation_error && (
                      <span className="text-red-600 truncate max-w-[280px]">{c.last_validation_error}</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={async () => { await test({ data: { id: c.id } }); toast.success("Teste enfileirado", { description: "Atualize em ~30s." }); }}
                    className="h-8 px-2.5 rounded-md border border-zinc-200 text-[12px] hover:bg-zinc-50">
                    Testar
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm("Remover esta credencial?")) return;
                      await del({ data: { id: c.id } });
                      toast.success("Removida");
                      refresh();
                    }}
                    className="h-8 px-2.5 rounded-md border border-red-200 text-red-700 text-[12px] hover:bg-red-50">
                    Remover
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
