import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-zinc-50">
        <div className="text-sm text-zinc-500">Carregando…</div>
      </div>
    );
  }

  if (!user) return null;

  return <Outlet />;
}
