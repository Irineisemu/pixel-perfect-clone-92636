// Edge Function: sync-all-processes
// Chamado pelo pg_cron a cada 30 minutos. Re-sincroniza todos os processos ativos.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: targets, error } = await admin
    .from("monitoring_targets")
    .select("id, process_number")
    .eq("type", "process")
    .eq("is_active", true)
    .not("process_number", "is", null);

  if (error) {
    console.error("[sync-all] query error:", error.message);
    return jsonResponse(500, { error: error.message });
  }

  if (!targets || targets.length === 0) {
    return jsonResponse(200, { synced: 0, message: "No active process targets" });
  }

  console.log(`[sync-all] syncing ${targets.length} processes`);
  let synced = 0;
  let failed = 0;

  for (const target of targets) {
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/sync-process-by-number`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          processNumber: target.process_number,
          targetId: target.id,
          isInitialSync: false,
        }),
      });
      if (res.ok) synced++;
      else {
        failed++;
        console.error(`[sync-all] failed for ${target.process_number}: ${res.status}`);
      }
      await new Promise((r) => setTimeout(r, 1000));
    } catch (err: any) {
      failed++;
      console.error(`[sync-all] error for ${target.process_number}:`, err.message);
    }
  }

  return jsonResponse(200, { synced, failed, total: targets.length });
});

function jsonResponse(status: number, body: any): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
