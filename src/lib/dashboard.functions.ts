import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;

    const [{ data: lawyers }, { data: linkRows, count: totalProcesses }] = await Promise.all([
      sb
        .from("monitoring_targets")
        .select("id, lawyer_name, oab_numbers, discovery_status, last_discovery_at, created_at")
        .eq("type", "lawyer")
        .eq("is_active", true)
        .order("created_at", { ascending: false }),
      sb
        .from("target_process_links")
        .select(
          `
          target_id,
          matched_via,
          matched_value,
          first_linked_at,
          target:monitoring_targets!inner(id, lawyer_name, type),
          process:processes!inner(id, process_number, tribunal_alias, class_code, subject_codes, last_synced_at)
          `,
          { count: "exact" }
        )
        .is("unlinked_at", null)
        .order("first_linked_at", { ascending: false })
        .limit(50),
    ]);

    const processes = (linkRows ?? []).map((r: any) => ({
      id: r.process.id,
      processNumber: r.process.process_number,
      tribunal: r.process.tribunal_alias,
      classCode: r.process.class_code,
      subjectCodes: r.process.subject_codes ?? [],
      lastSyncedAt: r.process.last_synced_at,
      matchedVia: r.matched_via,
      matchedValue: r.matched_value,
      linkedAt: r.first_linked_at,
      target: {
        id: r.target.id,
        name: r.target.lawyer_name ?? "Alvo",
      },
    }));

    const hasRunningDiscovery = (lawyers ?? []).some(
      (l: any) => l.discovery_status === "running" || l.discovery_status === "pending",
    );

    return {
      stats: {
        totalProcesses: totalProcesses ?? 0,
        totalLawyers: lawyers?.length ?? 0,
      },
      lawyers: lawyers ?? [],
      processes,
      hasRunningDiscovery,
    };
  });
