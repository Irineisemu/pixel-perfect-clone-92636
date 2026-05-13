import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CreateProcessSchema = z.object({
  processNumbers: z
    .array(z.string())
    .min(1, "Informe ao menos um número de processo.")
    .max(20, "Máximo de 20 processos por vez."),
  nickname: z.string().optional(),
});

type CreateResult = {
  processNumber: string;
  status: "queued" | "invalid" | "duplicate";
  targetId?: string;
  message?: string;
};

export const createProcessTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => CreateProcessSchema.parse(data))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const userId = context.userId;
    const supabaseUrl = process.env.SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const results: CreateResult[] = [];

    for (const raw of data.processNumbers) {
      const normalized = raw.replace(/\D/g, "");
      if (normalized.length < 15 || normalized.length > 25) {
        results.push({
          processNumber: raw,
          status: "invalid",
          message: "Formato inválido. Use o número CNJ completo.",
        });
        continue;
      }

      // Duplicata: mesmo user já tem target deste número
      const { data: existing } = await sb
        .from("monitoring_targets")
        .select("id")
        .eq("user_id", userId)
        .eq("type", "process")
        .eq("process_number", normalized)
        .eq("is_active", true)
        .maybeSingle();

      if (existing) {
        results.push({
          processNumber: raw,
          status: "duplicate",
          message: "Este processo já está sendo monitorado.",
        });
        continue;
      }

      const { data: target, error: targetError } = await sb
        .from("monitoring_targets")
        .insert({
          user_id: userId,
          type: "process",
          process_number: normalized,
          nickname: data.nickname?.trim() || null,
          tribunal_scope: ["api_publica_tjrj"],
          source_type: "manual_number",
          is_active: true,
          discovery_status: "pending",
        })
        .select("id")
        .single();

      if (targetError || !target) {
        results.push({
          processNumber: raw,
          status: "invalid",
          message: `Erro ao criar: ${targetError?.message}`,
        });
        continue;
      }

      // Disparar sync imediato (fire-and-forget)
      fetch(`${supabaseUrl}/functions/v1/sync-process-by-number`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          processNumber: normalized,
          targetId: target.id,
          isInitialSync: true,
        }),
      }).catch((err) => {
        console.error(`[createProcessTargets] sync dispatch failed for ${normalized}:`, err);
      });

      results.push({ processNumber: raw, status: "queued", targetId: target.id });
    }

    return { results };
  });

const SyncNowSchema = z.object({
  processId: z.string().uuid(),
});

export const syncProcessNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SyncNowSchema.parse(data))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const userId = context.userId;
    const supabaseUrl = process.env.SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    // Garante que o usuário tem acesso ao processo via target_process_links
    const { data: link } = await sb
      .from("target_process_links")
      .select("target_id, process:processes!inner(id, process_number), target:monitoring_targets!inner(id, user_id)")
      .eq("process_id", data.processId)
      .is("unlinked_at", null)
      .limit(1)
      .maybeSingle();

    if (!link || (link as any).target?.user_id !== userId) {
      return { ok: false, error: "not_found" };
    }

    const processNumber = (link as any).process.process_number as string;
    const targetId = (link as any).target_id as string;

    // Marca como sincronizando
    await sb.from("processes").update({ sync_status: "pending" }).eq("id", data.processId);

    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/sync-process-by-number`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ processNumber, targetId, isInitialSync: false }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, error: json?.error ?? `http_${res.status}` };
      }
      return { ok: true, ...json };
    } catch (err: any) {
      console.error("[syncProcessNow] dispatch failed:", err);
      return { ok: false, error: "dispatch_failed", message: err?.message };
    }
  });

const ListMovementsSchema = z.object({
  processId: z.string().uuid(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export const listProcessMovements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ListMovementsSchema.parse(data))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;

    const { data: rows, count, error } = await sb
      .from("process_movements")
      .select(
        "id, movement_code, movement_name, occurred_at, organ_name, organ_code, complements, is_new",
        { count: "exact" },
      )
      .eq("process_id", data.processId)
      .order("occurred_at", { ascending: false })
      .range(from, to);

    if (error) {
      return { movements: [], total: 0, page: data.page, pageSize: data.pageSize, error: error.message };
    }

    return {
      movements: rows ?? [],
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
    };
  });
