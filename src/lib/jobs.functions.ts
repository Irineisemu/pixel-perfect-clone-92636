import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const filtersSchema = z.object({
  status: z.array(z.string()).optional(),
  tribunal: z.string().optional(),
  errorKind: z.string().optional(),
  page: z.number().min(1).max(1000).default(1),
  pageSize: z.number().min(5).max(100).default(25),
});

export const getUserJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: any) => {
    const payload = (input && typeof input === 'object' && 'data' in input) ? input.data : input;
    return filtersSchema.parse(payload ?? {});
  })
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // 1. Pega ids dos targets do usuário (RLS já protege; mas usamos admin pra eficiência)
    const { data: targets } = await supabaseAdmin
      .from("monitoring_targets")
      .select("id")
      .eq("user_id", userId);
    const targetIds = (targets ?? []).map((t) => t.id);

    let q = supabaseAdmin
      .from("ingestion_jobs")
      .select(
        "id, kind, tribunal, process_number, status, attempts, max_attempts, priority, scheduled_for, locked_until, last_error, last_error_kind, payload, target_ids, created_at, updated_at",
        { count: "exact" },
      );

    // Filtra por targets do usuário OU jobs cujo payload.user_id == userId (credential_check)
    if (targetIds.length) {
      q = q.or(`target_ids.ov.{${targetIds.join(",")}},payload->>user_id.eq.${userId}`);
    } else {
      q = q.eq("payload->>user_id", userId);
    }

    if (data.status?.length) q = q.in("status", data.status as any);
    if (data.tribunal) q = q.eq("tribunal", data.tribunal);
    if (data.errorKind) q = q.eq("last_error_kind", data.errorKind);

    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    const { data: rows, error, count } = await q
      .order("updated_at", { ascending: false })
      .range(from, to);
    if (error) throw error;

    // KPIs últimas 24h
    const since = new Date(Date.now() - 86_400_000).toISOString();
    let metricsQ = supabaseAdmin
      .from("ingestion_jobs")
      .select("status, last_error_kind", { count: "exact", head: false })
      .gte("updated_at", since);
    if (targetIds.length) {
      metricsQ = metricsQ.or(`target_ids.ov.{${targetIds.join(",")}},payload->>user_id.eq.${userId}`);
    } else {
      metricsQ = metricsQ.eq("payload->>user_id", userId);
    }
    const { data: metrics } = await metricsQ;
    const m = metrics ?? [];
    const total24h = m.length;
    const ok24h = m.filter((r: any) => r.status === "done").length;
    const failed24h = m.filter((r: any) => r.status === "dead_letter").length;
    const pending = m.filter((r: any) => r.status === "needs_scraping" || r.status === "queued" || r.status === "processing").length;

    return {
      rows: rows ?? [],
      page: data.page,
      pageSize: data.pageSize,
      total: count ?? 0,
      kpis: {
        total24h,
        ok24h,
        failed24h,
        pending,
        successRate: total24h ? Math.round((ok24h / total24h) * 100) : null,
      },
    };
  });

export const retryJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: any) => {
    const payload = (input && typeof input === 'object' && 'data' in input) ? input.data : input;
    if (!payload || typeof payload !== 'object') {
      throw new Error("Parâmetros de entrada inválidos.");
    }
    return z.object({ id: z.string().uuid() }).parse(payload);
  })
  .handler(async ({ data, context }) => {
    const { userId } = context;
    // Verifica autoria
    const { data: job } = await supabaseAdmin
      .from("ingestion_jobs")
      .select("id, target_ids, payload")
      .eq("id", data.id)
      .maybeSingle();
    if (!job) throw new Error("Job não encontrado");

    const { data: targets } = await supabaseAdmin
      .from("monitoring_targets")
      .select("id")
      .eq("user_id", userId);
    const userTargetIds = new Set((targets ?? []).map((t) => t.id));
    const payload = (job.payload ?? {}) as Record<string, any>;
    const owns =
      payload.user_id === userId ||
      (job.target_ids ?? []).some((t: string) => userTargetIds.has(t));
    if (!owns) throw new Error("Sem permissão");

    const { error } = await supabaseAdmin
      .from("ingestion_jobs")
      .update({
        status: "needs_scraping",
        attempts: 0,
        last_error: null,
        last_error_kind: null,
        scheduled_for: new Date().toISOString(),
        locked_until: null,
      })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
