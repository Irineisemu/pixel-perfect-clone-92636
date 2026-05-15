import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const getWorkerStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("worker_heartbeats")
      .select("worker_id, last_seen_at, last_success_at, metadata")
      .order("last_seen_at", { ascending: false });
    if (error) throw error;

    const now = Date.now();
    const workers = (data ?? []).map((w: any) => {
      const lastSeenMs = now - new Date(w.last_seen_at).getTime();
      const lastSuccessMs = w.last_success_at ? now - new Date(w.last_success_at).getTime() : null;
      // Considera offline se passou mais de 60s sem heartbeat (tick padrão = 5s).
      const online = lastSeenMs < 60_000;
      return {
        workerId: w.worker_id,
        lastSeenMs,
        lastSuccessMs,
        online,
        metadata: w.metadata ?? {},
      };
    });

    return {
      workers,
      anyOnline: workers.some((w) => w.online),
      hasAny: workers.length > 0,
    };
  });
