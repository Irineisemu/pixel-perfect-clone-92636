import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CreateProcessSchema = z.object({
  processNumbers: z
    .array(z.string())
    .min(1, "Informe ao menos um número de processo.")
    .max(20, "Máximo de 20 processos por vez."),
  nickname: z.string().optional(),
});

type CreateResult = {
  processNumber: string;
  status: "queued" | "invalid" | "duplicate" | "not_found";
  targetId?: string;
  message?: string;
};

function maskCNJ(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 20) return value;
  return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(13, 14)}.${digits.slice(14, 16)}.${digits.slice(16, 20)}`;
}


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

      // Aguardar a sync concluir para que o dashboard já mostre os dados completos
      try {
        const syncRes = await fetch(`${supabaseUrl}/functions/v1/sync-process-by-number`, {
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
          signal: AbortSignal.timeout(40000),
        });
        const syncJson: any = await syncRes.json().catch(() => ({}));
        if (!syncRes.ok) {
          if (syncRes.status === 404 || syncJson?.error === "process_not_found") {
            await sb.from("monitoring_targets").delete().eq("id", target.id);
            results.push({
              processNumber: raw,
              status: "not_found",
              message: `Processo ${maskCNJ(normalized)} não encontrado no DataJud TJRJ.`,
            });
            continue;
          }
          results.push({
            processNumber: raw,
            status: "queued",
            targetId: target.id,
            message: syncJson?.message || `Sync falhou (${syncRes.status}). Use "Sincronizar agora" no dashboard.`,
          });
          continue;
        }
      } catch (err: any) {
        console.error(`[createProcessTargets] sync failed for ${normalized}:`, err);
        results.push({
          processNumber: raw,
          status: "queued",
          targetId: target.id,
          message: 'Cadastrado, mas sync demorou. Use "Sincronizar agora" no dashboard.',
        });
        continue;
      }

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
