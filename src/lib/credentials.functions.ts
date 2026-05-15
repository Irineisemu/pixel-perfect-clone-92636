import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TRIBUNAL = z.enum(["tjrj", "tjsp"]);

const upsertSchema = z.object({
  tribunal: TRIBUNAL,
  oabNumber: z.string().regex(/^\d{1,7}$/, "OAB inválida"),
  oabUf: z.string().regex(/^[A-Za-z]{2}$/, "UF inválida"),
  password: z.string().min(4).max(200),
});

export const listCredentials = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("tribunal_credentials")
      .select("id, tribunal_alias, oab_number, oab_uf, last_validated_at, last_validation_status, last_validation_error, updated_at")
      .order("tribunal_alias");
    if (error) throw error;
    return data ?? [];
  });

export const upsertCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => upsertSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const key = process.env.CREDENTIALS_ENCRYPTION_KEY;
    if (!key) throw new Error("Servidor sem chave de criptografia configurada");
    const { data: id, error } = await supabase.rpc("set_tribunal_credential", {
      _tribunal: data.tribunal,
      _oab_number: data.oabNumber,
      _oab_uf: data.oabUf.toUpperCase(),
      _password: data.password,
      _key: key,
    });
    if (error) throw error;
    return { id };
  });

export const deleteCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("tribunal_credentials").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const testCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    const { data: cred, error } = await supabase
      .from("tribunal_credentials")
      .select("id, tribunal_alias")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!cred) throw new Error("Credencial não encontrada");

    // Enfileira via service role (não há policy de insert pra usuários)
    const { error: insErr } = await supabaseAdmin.from("ingestion_jobs").insert({
      kind: "credential_check",
      tribunal: cred.tribunal_alias,
      process_number: "_credential_check",
      target_ids: [],
      payload: { credential_id: cred.id, user_id: userId },
      status: "needs_scraping",
      priority: 2,
    });
    if (insErr) throw insErr;
    return { ok: true };
  });
