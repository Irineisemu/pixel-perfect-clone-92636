import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, FormEvent, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/" });
  }, [user, loading, navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) {
      toast.error("Não foi possível entrar", { description: error.message });
      return;
    }
    toast.success("Bem-vindo de volta");
    navigate({ to: "/" });
  }

  return (
    <div className="min-h-screen grid place-items-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="inline-grid h-10 w-10 place-items-center rounded-md bg-zinc-900 text-white mx-auto">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 3v9l6 3" />
            </svg>
          </div>
          <h1 className="mt-3 font-display text-2xl tracking-tight text-zinc-900">Entrar no JusRadar</h1>
          <p className="mt-1 text-sm text-zinc-500">Acompanhe seus alvos e movimentações.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-zinc-600">E-mail</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email"
              className="mt-1 w-full h-10 px-3 rounded-md border border-zinc-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400" />
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-zinc-600">Senha</label>
            <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
              className="mt-1 w-full h-10 px-3 rounded-md border border-zinc-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400" />
          </div>
          <button type="submit" disabled={submitting}
            className="w-full h-10 rounded-md bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition disabled:opacity-60">
            {submitting ? "Entrando…" : "Entrar"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-zinc-600">
          Não tem conta? <Link to="/signup" className="font-medium text-zinc-900 hover:underline">Cadastre-se</Link>
        </p>
      </div>
    </div>
  );
}
