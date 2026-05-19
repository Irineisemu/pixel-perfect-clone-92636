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
  .inputValidator((input: any) => {
    const payload = (input && typeof input === 'object' && 'data' in input) ? input.data : (input ?? {});
    return upsertSchema.parse(payload);
  })
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
  .inputValidator((input: any) => {
    const payload = (input && typeof input === 'object' && 'data' in input) ? input.data : (input ?? {});
    return z.object({ id: z.string().uuid() }).parse(payload);
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("tribunal_credentials").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const testCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: any) => {
    const payload = (input && typeof input === 'object' && 'data' in input) ? input.data : input;
    if (!payload || typeof payload !== 'object') {
      throw new Error("Parâmetros de entrada inválidos.");
    }
    return z.object({ id: z.string().uuid() }).parse(payload);
  })
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    const { data: cred, error } = await supabase
      .from("tribunal_credentials")
      .select("id, tribunal_alias")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!cred) throw new Error("Credencial não encontrada");

    // Marca como "em teste" para o usuário ver feedback imediato
    await supabaseAdmin
      .from("tribunal_credentials")
      .update({ last_validation_status: "testing", last_validation_error: null })
      .eq("id", cred.id);

    // Enfileira via service role (não há policy de insert pra usuários)
    const { data: job, error: insErr } = await supabaseAdmin
      .from("ingestion_jobs")
      .insert({
        kind: "credential_check",
        tribunal: cred.tribunal_alias,
        process_number: "_credential_check",
        target_ids: [],
        payload: { credential_id: cred.id, user_id: userId },
        status: "needs_scraping",
        priority: 2,
      })
      .select("id")
      .single();
    if (insErr) throw insErr;
    return { ok: true, jobId: job.id, credentialId: cred.id };
  });

export const getCredentialStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: any) => {
    const payload = (input && typeof input === 'object' && 'data' in input) ? input.data : input;
    if (!payload || typeof payload !== 'object') {
      throw new Error("Parâmetros de entrada inválidos.");
    }
    return z.object({ id: z.string().uuid() }).parse(payload);
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("tribunal_credentials")
      .select("id, last_validation_status, last_validation_error, last_validated_at")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    return row;
  });
