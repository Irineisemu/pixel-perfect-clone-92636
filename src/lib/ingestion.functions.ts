/**
 * Server functions de ingestão.
 *
 * Importa client.server apenas aqui — nunca em componentes ou hooks.
 * Tudo é exposto via createServerFn (RPC tipado).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DataJudAdapter } from "@/ingestion/adapters/datajud";
import { SourceRouter, IngestionError } from "@/ingestion/core/router";
import { CircuitBreaker } from "@/ingestion/core/circuit-breaker";
import { AdapterError, type CanonicalProcess } from "@/ingestion/core/types";

function getRouter() {
  const apiKey = process.env.DATAJUD_API_KEY ?? "";
  const datajud = new DataJudAdapter({ db: supabaseAdmin, apiKey });
  return new SourceRouter([datajud], supabaseAdmin);
}

function logJson(level: "info" | "warn" | "error", payload: Record<string, unknown>) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, ...payload });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

// ============================================================
// enqueueSyncJobs — varre monitoring_targets ativos e enfileira
// ============================================================
export const enqueueSyncJobs = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      mode: z.enum(["targeted", "discovery"]).default("targeted"),
    }),
  )
  .handler(async ({ data }) => {
    const correlationId = crypto.randomUUID();
    let enqueued = 0;

    if (data.mode === "targeted") {
      const { data: targets, error } = await supabaseAdmin
        .from("monitoring_targets")
        .select("id, user_id, type, process_number, tribunal_alias, tribunal_aliases")
        .eq("is_active", true)
        .eq("type", "process")
        .not("process_number", "is", null);
      if (error) throw error;

      for (const t of targets ?? []) {
        const tribunal = t.tribunal_alias ?? t.tribunal_aliases?.[0];
        if (!tribunal || !t.process_number) continue;
        const { error: insErr } = await supabaseAdmin.from("ingestion_jobs").insert({
          process_number: t.process_number,
          tribunal,
          target_ids: [t.id],
          priority: 5,
          correlation_id: correlationId,
          payload: { source: "targeted" },
        });
        if (!insErr) enqueued++;
      }
    }

    if (data.mode === "discovery") {
      // Para targets radar, executa search no DataJud e enfileira hits novos
      const router = getRouter();
      const { data: radars } = await supabaseAdmin
        .from("monitoring_targets")
        .select("id, user_id, class_codes, keywords, tribunal_aliases")
        .eq("is_active", true)
        .eq("type", "radar");

      for (const r of radars ?? []) {
        for (const tribunal of r.tribunal_aliases ?? []) {
          try {
            const adapter = new DataJudAdapter({
              db: supabaseAdmin,
              apiKey: process.env.DATAJUD_API_KEY ?? "",
            });
            if (!adapter.supports(tribunal)) continue;
            const result = await adapter.searchProcesses({
              tribunal,
              classCodes: (r.class_codes ?? []).map((c: string) => Number(c)).filter(Number.isFinite),
              pageSize: 50,
            });
            for (const hit of result.hits) {
              await supabaseAdmin.from("ingestion_jobs").insert({
                process_number: hit.processNumber,
                tribunal,
                target_ids: [r.id],
                priority: 7,
                correlation_id: correlationId,
                payload: { source: "discovery" },
              });
              enqueued++;
            }
          } catch (err) {
            logJson("warn", { event: "discovery_failed", tribunal, error: String(err) });
          }
        }
      }
      // router used implicitly for type-checking
      void router;
    }

    logJson("info", { event: "enqueue_done", mode: data.mode, enqueued, correlationId });
    return { enqueued, correlationId };
  });

// ============================================================
// processDataJudJobs — pega N jobs em status='queued' e processa
// ============================================================
export const processDataJudJobs = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      limit: z.number().int().min(1).max(50).default(10),
      workerId: z.string().default("lovable-worker"),
    }),
  )
  .handler(async ({ data }) => {
    const router = getRouter();
    const { data: jobs, error } = await supabaseAdmin.rpc("pick_ingestion_jobs", {
      _statuses: ["queued"],
      _worker: data.workerId,
      _lock_seconds: 120,
      _limit: data.limit,
    });
    if (error) throw error;

    const results: Array<{ id: string; outcome: string }> = [];

    for (const job of (jobs ?? []) as Array<{
      id: string;
      process_number: string;
      tribunal: string;
      attempts: number;
      max_attempts: number;
      correlation_id: string;
    }>) {
      const start = Date.now();
      try {
        const route = await router.route({
          processNumber: job.process_number,
          tribunal: job.tribunal,
          correlationId: job.correlation_id,
        });
        await emitProcessUpdate(job, route.process);
        await supabaseAdmin
          .from("ingestion_jobs")
          .update({
            status: "done",
            locked_until: null,
            last_error: null,
            last_error_kind: null,
          })
          .eq("id", job.id);
        results.push({ id: job.id, outcome: "success" });
        logJson("info", {
          event: "fetch_ok",
          jobId: job.id,
          adapter: route.adapterUsed,
          durationMs: Date.now() - start,
          processNumber: job.process_number,
          correlationId: job.correlation_id,
        });
      } catch (err) {
        const isAdapter = err instanceof AdapterError;
        const isIngestion = err instanceof IngestionError;
        const errorKind = isAdapter
          ? err.kind
          : isIngestion
            ? "all_sources_failed"
            : "unexpected";

        // tribunais não suportados por DataJud → marcar para scraping (TJSP no MVP)
        let nextStatus: "queued" | "needs_scraping" | "failed" | "dead_letter" = "queued";
        if (isIngestion && err.message.includes("no adapter") && job.tribunal.toUpperCase() === "TJSP") {
          nextStatus = "needs_scraping";
        } else if (isAdapter && err.kind === "not_found") {
          nextStatus = job.attempts >= job.max_attempts ? "failed" : "queued";
        } else if (job.attempts >= job.max_attempts) {
          nextStatus = "dead_letter";
        }

        const backoff = Math.min(60_000 * Math.pow(2, job.attempts), 3_600_000);
        await supabaseAdmin
          .from("ingestion_jobs")
          .update({
            status: nextStatus,
            locked_until: null,
            scheduled_for: nextStatus === "queued" ? new Date(Date.now() + backoff).toISOString() : new Date().toISOString(),
            last_error: String((err as Error).message ?? err).slice(0, 500),
            last_error_kind: errorKind,
          })
          .eq("id", job.id);

        results.push({ id: job.id, outcome: errorKind });
        logJson("warn", {
          event: "fetch_failed",
          jobId: job.id,
          errorKind,
          nextStatus,
          processNumber: job.process_number,
          correlationId: job.correlation_id,
        });
      }
    }
    return { processed: results.length, results };
  });

async function emitProcessUpdate(
  job: { id: string; process_number: string; tribunal: string; correlation_id: string },
  canonical: CanonicalProcess,
) {
  // Garante linha em processes
  const { data: existing } = await supabaseAdmin
    .from("processes")
    .select("id, last_known_movements_hash")
    .eq("process_number", canonical.processNumber)
    .eq("tribunal_alias", canonical.tribunalAlias)
    .maybeSingle();

  let processId = existing?.id;
  const previousHash = existing?.last_known_movements_hash ?? null;

  if (!processId) {
    const { data: ins, error } = await supabaseAdmin
      .from("processes")
      .insert({
        process_number: canonical.processNumber,
        tribunal_alias: canonical.tribunalAlias,
        class_code: canonical.classCode,
        subject_codes: canonical.subjectCodes,
        last_known_movements_hash: canonical.movementsHash,
        last_synced_at: canonical.fetchedAt,
        last_source_used: canonical.source,
      })
      .select("id")
      .single();
    if (error) throw error;
    processId = ins.id;
  } else if (previousHash !== canonical.movementsHash) {
    await supabaseAdmin
      .from("processes")
      .update({
        last_known_movements_hash: canonical.movementsHash,
        last_synced_at: canonical.fetchedAt,
        last_source_used: canonical.source,
      })
      .eq("id", processId);
  }

  // Sem mudança → não emite update
  if (previousHash === canonical.movementsHash) return;

  const movementsDiff = previousHash ? canonical.movements : canonical.movements;

  await supabaseAdmin.from("process_updates").insert({
    process_id: processId,
    process_number: canonical.processNumber,
    tribunal: canonical.tribunalAlias,
    source: canonical.source,
    canonical: canonical as unknown as object,
    movements_diff: movementsDiff as unknown as object,
    movements_hash: canonical.movementsHash,
  });
}

// ============================================================
// Endpoints admin
// ============================================================

async function ensureAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("forbidden: admin role required");
}

export const getIngestionHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.userId);
    const { data: breakers } = await supabaseAdmin.from("circuit_breakers").select("*");
    const { count: queued } = await supabaseAdmin
      .from("ingestion_jobs")
      .select("*", { count: "exact", head: true })
      .eq("status", "queued");
    const { count: dlq } = await supabaseAdmin
      .from("ingestion_jobs")
      .select("*", { count: "exact", head: true })
      .eq("status", "dead_letter");
    return { breakers: breakers ?? [], queued: queued ?? 0, deadLetter: dlq ?? 0 };
  });

export const resetBreaker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ adapter: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const breaker = new CircuitBreaker(supabaseAdmin);
    await breaker.reset(data.adapter);
    return { ok: true };
  });

export const replayDeadLetter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ jobIds: z.array(z.string().uuid()).optional() }))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const q = supabaseAdmin
      .from("ingestion_jobs")
      .update({
        status: "queued",
        attempts: 0,
        scheduled_for: new Date().toISOString(),
        last_error: null,
        last_error_kind: null,
      })
      .eq("status", "dead_letter");
    if (data.jobIds?.length) q.in("id", data.jobIds);
    const { error, count } = await q.select("*", { count: "exact" });
    if (error) throw error;
    return { requeued: count ?? 0 };
  });

export const listDeadLetter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.userId);
    const { data } = await supabaseAdmin
      .from("ingestion_jobs")
      .select("id, process_number, tribunal, attempts, last_error, last_error_kind, updated_at")
      .eq("status", "dead_letter")
      .order("updated_at", { ascending: false })
      .limit(100);
    return { jobs: data ?? [] };
  });
