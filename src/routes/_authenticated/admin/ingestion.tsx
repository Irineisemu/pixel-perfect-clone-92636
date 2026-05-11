import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  getIngestionHealth,
  resetBreaker,
  replayDeadLetter,
  listDeadLetter,
} from "@/lib/ingestion.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/admin/ingestion")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
  },
  component: IngestionAdminPage,
});

function IngestionAdminPage() {
  const fetchHealth = useServerFn(getIngestionHealth);
  const fetchDLQ = useServerFn(listDeadLetter);
  const resetFn = useServerFn(resetBreaker);
  const replayFn = useServerFn(replayDeadLetter);
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const health = useQuery({
    queryKey: ["ingestion-health"],
    queryFn: () => fetchHealth().catch((e) => { setError(String(e.message ?? e)); throw e; }),
    refetchInterval: 10_000,
  });
  const dlq = useQuery({
    queryKey: ["ingestion-dlq"],
    queryFn: () => fetchDLQ(),
    refetchInterval: 30_000,
  });

  const reset = useMutation({
    mutationFn: (adapter: string) => resetFn({ data: { adapter } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ingestion-health"] }),
  });
  const replay = useMutation({
    mutationFn: () => replayFn({ data: {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ingestion-dlq"] }),
  });

  if (error) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6 text-sm text-destructive">
            Acesso negado. Esta página requer papel <code>admin</code>.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Ingestão — Painel</h1>
        <p className="text-sm text-muted-foreground">
          Estado dos adapters, fila e dead-letter.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Fila (queued)</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold">{health.data?.queued ?? "—"}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Dead-letter</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold">{health.data?.deadLetter ?? "—"}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Adapters</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold">{health.data?.breakers.length ?? 0}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Circuit breakers</CardTitle></CardHeader>
        <CardContent>
          {health.data?.breakers.length ? (
            <ul className="space-y-2">
              {health.data.breakers.map((b) => (
                <li key={b.adapter} className="flex items-center justify-between border rounded-md px-3 py-2">
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{b.adapter}</span>
                    <Badge variant={b.state === "closed" ? "secondary" : b.state === "open" ? "destructive" : "outline"}>
                      {b.state}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      falhas: {b.failure_count}
                    </span>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => reset.mutate(b.adapter)}>
                    Reset
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum estado registrado ainda.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Dead-letter</CardTitle>
          <Button size="sm" onClick={() => replay.mutate()} disabled={replay.isPending}>
            Reenfileirar tudo
          </Button>
        </CardHeader>
        <CardContent>
          {dlq.data?.jobs.length ? (
            <div className="space-y-2 text-sm">
              {dlq.data.jobs.map((j) => (
                <div key={j.id} className="border rounded-md px-3 py-2">
                  <div className="font-mono text-xs">{j.process_number} · {j.tribunal}</div>
                  <div className="text-xs text-muted-foreground">
                    {j.attempts}× · {j.last_error_kind} · {j.last_error}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Vazio.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
