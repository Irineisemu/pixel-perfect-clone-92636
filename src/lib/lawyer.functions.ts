/**
 * Server functions da modalidade lawyer (advogado).
 *
 * - createLawyerTarget: valida, cria o target, cria a discovery_run e enfileira o job
 * - getDiscoveryStatus: lê última run + progresso
 * - triggerRediscovery: rate limit 6h + reenfileira
 * - enqueueLawyerRefreshJobs: usado pelo cron diário
 * - runLawyerDiscoveryJob: handler do worker (chamado pelo tick)
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  searchByOab,
  logProbe,
  LawyerSearchError,
  type LawyerSearchVariant,
} from "@/ingestion/adapters/datajud/lawyer-search";
import { OAB_REGEX, normalizeOAB, maskOABForLog } from "@/types/targets";

const TJRJ_ALIAS = "api_publica_tjrj";
const TRIBUNAL_KEY = "TJRJ";
const LAWYER_LIMIT = 3;
const HARD_CAP_HITS = 50_000;
const REDISCOVERY_WINDOW_MS = 6 * 60 * 60 * 1000;

function logJson(level: "info" | "warn" | "error", payload: Record<string, unknown>) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, ...payload });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

// ============================================================
// createLawyerTarget
// ============================================================
const CreateLawyerSchema = z.object({
  lawyer_name: z.string().trim().min(3).max(200),
  oab_numbers: z.array(z.string()).min(1).max(10),
  include_inactive: z.boolean().optional().default(false),
});

export const createLawyerTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: any) => {
    const payload = (input && typeof input === 'object' && 'data' in input) ? input.data : input;
    if (!payload || typeof payload !== 'object') {
      throw new Error("Parâmetros de entrada inválidos.");
    }
    return CreateLawyerSchema.parse(payload);
  })
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    console.log("[createLawyerTarget] userId=", userId);

    // Normaliza + dedupe OABs
    const normalized = Array.from(
      new Set(data.oab_numbers.map((o) => normalizeOAB(o))),
    );
    const invalid = normalized.filter((o) => !OAB_REGEX.test(o));
    if (invalid.length) {
      return {
        error: "invalid_oabs",
        invalid,
      } as const;
    }

    // Limite de lawyers ativos por usuário
    const { count: activeCount } = await supabaseAdmin
      .from("monitoring_targets")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("type", "lawyer")
      .eq("is_active", true);
    if ((activeCount ?? 0) >= LAWYER_LIMIT) {
      return { error: "lawyer_target_limit_reached", limit: LAWYER_LIMIT } as const;
    }

    // OAB já monitorada por outro target ativo do mesmo usuário?
    const { data: dups } = await supabaseAdmin
      .from("monitoring_targets")
      .select("id, oab_numbers")
      .eq("user_id", userId)
      .eq("type", "lawyer")
      .eq("is_active", true)
      .overlaps("oab_numbers", normalized);
    if (dups && dups.length > 0) {
      return {
        error: "oab_already_monitored",
        existing_target_id: dups[0].id,
      } as const;
    }

    // Insere target
    const { data: target, error: insErr } = await supabaseAdmin
      .from("monitoring_targets")
      .insert({
        user_id: userId,
        type: "lawyer",
        is_active: true,
        lawyer_name: data.lawyer_name.trim(),
        oab_numbers: normalized,
        include_inactive: data.include_inactive,
        tribunal_scope: [TJRJ_ALIAS],
        auto_discovered: true,
        discovery_status: "pending",
      })
      .select("*")
      .single();
    if (insErr || !target) {
      logJson("error", { event: "lawyer_target_insert_failed", error: String(insErr) });
      throw new Response(
        JSON.stringify({
          code: "database_error",
          message: "Erro ao salvar advogado.",
          db_error: insErr?.message ?? "unknown",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    // Cria discovery_run + enfileira job
    const runId = await startDiscoveryRun(target.id, userId, "initial", normalized);

    return {
      ok: true as const,
      target,
      runId,
      discovery_url: `/alvos/${target.id}/descoberta`,
    };
  });

// ============================================================
// getDiscoveryStatus
// ============================================================
export const getDiscoveryStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: any) => {
    const payload = (input && typeof input === 'object' && 'data' in input) ? input.data : input;
    if (!payload || typeof payload !== 'object') {
      throw new Error("Parâmetros de entrada inválidos.");
    }
    return z.object({ targetId: z.string().uuid() }).parse(payload);
  })
  .handler(async ({ data, context }) => {
    // Confirma ownership
    const { data: target } = await supabaseAdmin
      .from("monitoring_targets")
      .select("id, user_id, type, lawyer_name, oab_numbers, discovery_status, last_discovery_at")
      .eq("id", data.targetId)
      .maybeSingle();
    if (!target || target.user_id !== context.userId) {
      throw new Error("not_found");
    }

    const { data: run } = await supabaseAdmin
      .from("discovery_runs")
      .select("*")
      .eq("target_id", data.targetId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let progress: { percent_estimated: number | null; elapsed_sec: number } | null = null;
    if (run && run.status === "running") {
      const elapsed = Math.floor(
        (Date.now() - new Date(run.started_at).getTime()) / 1000,
      );
      progress = { percent_estimated: null, elapsed_sec: elapsed };
    }

    return { target, run, progress };
  });

// ============================================================
// triggerRediscovery
// ============================================================
export const triggerRediscovery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: any) => {
    const payload = (input && typeof input === 'object' && 'data' in input) ? input.data : input;
    if (!payload || typeof payload !== 'object') {
      throw new Error("Parâmetros de entrada inválidos.");
    }
    return z.object({ targetId: z.string().uuid() }).parse(payload);
  })
  .handler(async ({ data, context }) => {
    const { data: target } = await supabaseAdmin
      .from("monitoring_targets")
      .select("id, user_id, type, oab_numbers")
      .eq("id", data.targetId)
      .maybeSingle();
    if (!target || target.user_id !== context.userId || target.type !== "lawyer") {
      throw new Error("not_found");
    }

    const { data: last } = await supabaseAdmin
      .from("discovery_runs")
      .select("started_at, status")
      .eq("target_id", data.targetId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (last?.status === "running") {
      return { error: "discovery_already_running" } as const;
    }
    if (last?.started_at) {
      const elapsed = Date.now() - new Date(last.started_at).getTime();
      if (elapsed < REDISCOVERY_WINDOW_MS) {
        return {
          error: "rate_limit_exceeded",
          retry_after_seconds: Math.ceil((REDISCOVERY_WINDOW_MS - elapsed) / 1000),
        } as const;
      }
    }

    const oabs = (target.oab_numbers as string[]) ?? [];
    const runId = await startDiscoveryRun(target.id, context.userId, "manual", oabs);
    return { ok: true as const, runId };
  });

// ============================================================
// enqueueLawyerRefreshJobs (cron)
// ============================================================
export const enqueueLawyerRefreshJobs = createServerFn({ method: "POST" }).handler(
  async () => {
    const { data: targets } = await supabaseAdmin
      .from("monitoring_targets")
      .select("id, user_id, oab_numbers")
      .eq("type", "lawyer")
      .eq("is_active", true);

    let scheduled = 0;
    let i = 0;
    for (const t of targets ?? []) {
      const scheduledFor = new Date(Date.now() + i * 30_000).toISOString();
      const runId = await startDiscoveryRun(
        t.id,
        t.user_id,
        "periodic_refresh",
        (t.oab_numbers as string[]) ?? [],
        scheduledFor,
      );
      if (runId) scheduled++;
      i++;
    }
    return { scheduled };
  },
);

// ============================================================
// Helpers compartilhados
// ============================================================
async function startDiscoveryRun(
  targetId: string,
  userId: string,
  triggeredBy: "initial" | "manual" | "periodic_refresh",
  oabs: string[],
  scheduledFor?: string,
): Promise<string | null> {
  // Cria run em status running (worker já marca progresso assim que pega)
  const { data: run, error: runErr } = await supabaseAdmin
    .from("discovery_runs")
    .insert({
      target_id: targetId,
      user_id: userId,
      status: "running",
      triggered_by: triggeredBy,
    })
    .select("id")
    .single();
  if (runErr || !run) {
    logJson("error", { event: "discovery_run_insert_failed", error: String(runErr) });
    return null;
  }

  await supabaseAdmin
    .from("monitoring_targets")
    .update({ discovery_status: "running" })
    .eq("id", targetId);

  await supabaseAdmin.from("ingestion_jobs").insert({
    process_number: `LAWYER:${targetId}`,
    tribunal: TRIBUNAL_KEY,
    target_ids: [targetId],
    priority: 6,
    kind: "lawyer_discovery",
    scheduled_for: scheduledFor ?? new Date().toISOString(),
    payload: {
      kind: "lawyer_discovery",
      targetId,
      runId: run.id,
      oabs,
      triggeredBy,
    },
  });

  return run.id;
}

// ============================================================
// runLawyerDiscoveryJob (chamado pelo tick)
// ============================================================
interface JobRow {
  id: string;
  payload: any;
  attempts: number;
  max_attempts: number;
}

export async function runLawyerDiscoveryJob(job: JobRow): Promise<void> {
  const apiKey = process.env.DATAJUD_API_KEY ?? "";
  const payload = job.payload ?? {};
  const targetId = payload.targetId as string;
  const runId = payload.runId as string;
  const oabs = (payload.oabs as string[]) ?? [];
  const triggeredBy = (payload.triggeredBy as
    | "initial"
    | "manual"
    | "periodic_refresh") ?? "manual";

  if (!targetId || !runId || oabs.length === 0) {
    await failRun(runId, "invalid_job_payload");
    await markJobDone(job.id);
    return;
  }

  const startedAt = Date.now();
  const isInitial = triggeredBy === "initial";
  const errors: Record<string, string> = {};
  const byOab: Record<string, number> = Object.fromEntries(oabs.map((o) => [o, 0]));
  const byTribunal: Record<string, number> = { [TRIBUNAL_KEY]: 0 };
  let totalFound = 0;
  let cachedVariant: LawyerSearchVariant | null = null;
  const seenProcessIds: string[] = [];
  let hardCapped = false;

  for (const oab of oabs) {
    const uf = oab.slice(0, 2);
    const numero = oab.slice(2);
    let cursor: any[] | null = null;
    let pageIdx = 0;

    try {
      while (!hardCapped) {
        const page = await searchByOab({
          apiKey,
          alias: TJRJ_ALIAS,
          uf,
          numero,
          searchAfter: cursor,
          preferVariant: cachedVariant,
        });
        if (!cachedVariant) {
          cachedVariant = page.variantUsed;
          logProbe(uf, numero, page.variantUsed);
        }
        if (page.hits.length === 0) break;

        for (const hit of page.hits) {
          const processNumber = hit.source?.numeroProcesso as string | undefined;
          if (!processNumber) continue;

          const processId = await upsertProcessAndLink(
            processNumber,
            hit.source,
            targetId,
            oab,
            isInitial,
          );
          if (processId) seenProcessIds.push(processId);

          totalFound++;
          byOab[oab] = (byOab[oab] ?? 0) + 1;
          byTribunal[TRIBUNAL_KEY] = (byTribunal[TRIBUNAL_KEY] ?? 0) + 1;

          if (totalFound >= HARD_CAP_HITS) {
            hardCapped = true;
            errors["__hard_cap__"] = "hard_cap_reached";
            break;
          }
        }

        // Atualização de progresso a cada página
        await supabaseAdmin
          .from("discovery_runs")
          .update({
            total_found: totalFound,
            by_tribunal: byTribunal,
            by_oab: byOab,
          })
          .eq("id", runId);

        cursor = page.nextCursor;
        pageIdx++;
        if (!cursor) break;
      }
    } catch (err) {
      const msg =
        err instanceof LawyerSearchError ? `${err.kind}: ${err.message}` : String(err);
      errors[oab] = msg;
      logJson("warn", {
        event: "lawyer_search_failed",
        oab: maskOABForLog(oab),
        error: msg,
      });
    }
  }

  // Soft-unlink em refresh: processos previamente vinculados que não retornaram
  if (triggeredBy === "periodic_refresh" && Object.keys(errors).length === 0) {
    await softUnlinkMissing(targetId, seenProcessIds);
  }

  const allFailed = Object.keys(errors).length >= oabs.length && totalFound === 0;
  const finalStatus: "completed" | "partial" | "failed" = allFailed
    ? "failed"
    : Object.keys(errors).length > 0
      ? "partial"
      : "completed";

  await supabaseAdmin
    .from("discovery_runs")
    .update({
      status: finalStatus,
      total_found: totalFound,
      by_tribunal: byTribunal,
      by_oab: byOab,
      errors: Object.keys(errors).length ? errors : null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);

  await supabaseAdmin
    .from("monitoring_targets")
    .update({
      discovery_status: finalStatus,
      last_discovery_at: new Date().toISOString(),
    })
    .eq("id", targetId);

  await markJobDone(job.id);

  logJson("info", {
    event: "lawyer_discovery_done",
    targetId,
    runId,
    triggeredBy,
    totalFound,
    durationMs: Date.now() - startedAt,
    status: finalStatus,
  });
}

async function upsertProcessAndLink(
  processNumber: string,
  source: any,
  targetId: string,
  oab: string,
  isInitial: boolean,
): Promise<string | null> {
  const tribunalAlias = TRIBUNAL_KEY;
  const classCode =
    source?.classe?.codigo != null ? Number(source.classe.codigo) : null;
  const subjectCodes = Array.isArray(source?.assuntos)
    ? source.assuntos
        .map((a: any) => Number(a?.codigo))
        .filter((n: number) => Number.isFinite(n))
    : [];

  // Hash de movimentos: SHA-256 dos códigos+timestamps ordenados
  const movements = Array.isArray(source?.movimentos) ? source.movimentos : [];
  const sortedKeys = movements
    .map(
      (m: any) =>
        `${m?.codigo ?? ""}|${m?.dataHora ?? ""}|${m?.nome ?? ""}`,
    )
    .sort();
  const hashSrc = sortedKeys.join("\n");
  const movementsHash = await sha256Hex(hashSrc);

  const { data: existing } = await supabaseAdmin
    .from("processes")
    .select("id, last_known_movements_hash")
    .eq("process_number", processNumber)
    .eq("tribunal_alias", tribunalAlias)
    .maybeSingle();

  let processId = existing?.id;
  const previousHash = existing?.last_known_movements_hash ?? null;

  if (!processId) {
    const { data: ins, error } = await supabaseAdmin
      .from("processes")
      .insert({
        process_number: processNumber,
        tribunal_alias: tribunalAlias,
        class_code: classCode,
        subject_codes: subjectCodes,
        last_known_movements_hash: movementsHash,
        last_synced_at: new Date().toISOString(),
        last_source_used: "datajud",
      })
      .select("id")
      .single();
    if (error) return null;
    processId = ins.id;
  } else if (previousHash !== movementsHash) {
    await supabaseAdmin
      .from("processes")
      .update({
        last_known_movements_hash: movementsHash,
        last_synced_at: new Date().toISOString(),
        last_source_used: "datajud",
      })
      .eq("id", processId);
  }

  // Vincula (idempotente via UNIQUE)
  await supabaseAdmin.from("target_process_links").upsert(
    {
      target_id: targetId,
      process_id: processId,
      matched_via: "oab",
      matched_value: oab,
      first_linked_at: new Date().toISOString(),
      unlinked_at: null,
    },
    { onConflict: "target_id,process_id", ignoreDuplicates: false },
  );

  // Emite update apenas se hash mudou OU se é a primeira vez que vemos esse processo
  if (previousHash !== movementsHash) {
    await supabaseAdmin.from("process_updates").insert({
      process_id: processId,
      target_id: targetId,
      process_number: processNumber,
      tribunal: tribunalAlias,
      source: "datajud",
      canonical: JSON.parse(JSON.stringify(source)),
      movements_diff: JSON.parse(JSON.stringify(movements)),
      movements_hash: movementsHash,
      is_initial_discovery: isInitial,
    });
  }

  return processId;
}

async function softUnlinkMissing(targetId: string, seenIds: string[]) {
  if (seenIds.length === 0) return;
  // Marca como unlinked qualquer link ativo do target que não esteja na lista vista
  // Limita batch a 1000 ids por chamada
  const { data: links } = await supabaseAdmin
    .from("target_process_links")
    .select("process_id")
    .eq("target_id", targetId)
    .is("unlinked_at", null);
  const seen = new Set(seenIds);
  const missing = (links ?? [])
    .map((l) => l.process_id)
    .filter((id) => !seen.has(id));
  if (missing.length === 0) return;
  await supabaseAdmin
    .from("target_process_links")
    .update({ unlinked_at: new Date().toISOString() })
    .eq("target_id", targetId)
    .in("process_id", missing);
}

async function failRun(runId: string | undefined, reason: string) {
  if (!runId) return;
  await supabaseAdmin
    .from("discovery_runs")
    .update({
      status: "failed",
      finished_at: new Date().toISOString(),
      errors: { __fatal__: reason },
    })
    .eq("id", runId);
}

async function markJobDone(jobId: string) {
  await supabaseAdmin
    .from("ingestion_jobs")
    .update({
      status: "done",
      locked_until: null,
      last_error: null,
      last_error_kind: null,
    })
    .eq("id", jobId);
}

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
