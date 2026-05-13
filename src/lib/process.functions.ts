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
