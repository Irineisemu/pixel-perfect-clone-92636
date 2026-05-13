import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function formatProcessNumber(digits: string | null): string {
  if (!digits) return "";
  if (digits.length !== 20) return digits;
  return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(13, 14)}.${digits.slice(14, 16)}.${digits.slice(16, 20)}`;
}

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;

    const { data: lawyers } = await sb
      .from("monitoring_targets")
      .select("id, lawyer_name, oab_numbers, discovery_status, last_discovery_at, created_at")
      .eq("type", "lawyer")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    const { data: linkRows } = await sb
      .from("target_process_links")
      .select(
        `
        target_id,
        matched_via,
        matched_value,
        first_linked_at,
        target:monitoring_targets!inner(id, lawyer_name, nickname, type, source_type),
        process:processes!inner(
          id, process_number, tribunal_alias,
          class_code, class_name, subject_codes,
          instance, sync_status,
          last_synced_at, last_movement_at,
          total_movements, new_movements_count
        )
        `,
      )
      .is("unlinked_at", null)
      .order("first_linked_at", { ascending: false })
      .limit(100);

    const processes = (linkRows ?? []).map((r: any) => ({
      id: r.process.id,
      processNumber: r.process.process_number,
      displayNumber: formatProcessNumber(r.process.process_number),
      tribunal: r.process.tribunal_alias === "api_publica_tjrj" ? "TJRJ" : r.process.tribunal_alias,
      classCode: r.process.class_code,
      className: r.process.class_name,
      subjectCodes: r.process.subject_codes ?? [],
      instance: r.process.instance,
      syncStatus: r.process.sync_status ?? "pending",
      lastSyncedAt: r.process.last_synced_at,
      lastMovementAt: r.process.last_movement_at,
      totalMovements: r.process.total_movements ?? 0,
      newMovementsCount: r.process.new_movements_count ?? 0,
      matchedVia: r.matched_via,
      matchedValue: r.matched_value,
      linkedAt: r.first_linked_at,
      target: {
        id: r.target.id,
        sourceType: r.target.source_type,
        type: r.target.type,
        name:
          r.target.nickname ||
          r.target.lawyer_name ||
          `Processo ${formatProcessNumber(r.process.process_number)}`,
      },
    }));

    // Movimentações novas (até 20)
    const processIds = processes.map((p) => p.id);
    let recentNewMovements: any[] = [];
    if (processIds.length > 0) {
      const { data: movs } = await sb
        .from("process_movements")
        .select("id, movement_name, occurred_at, organ_name, process_id")
        .eq("is_new", true)
        .in("process_id", processIds)
        .order("occurred_at", { ascending: false })
        .limit(20);

      const procById = new Map(processes.map((p) => [p.id, p]));
      recentNewMovements = (movs ?? []).map((m: any) => {
        const p = procById.get(m.process_id);
        return {
          id: m.id,
          movementName: m.movement_name,
          occurredAt: m.occurred_at,
          organName: m.organ_name,
          processId: m.process_id,
          processNumber: p?.displayNumber,
          processClass: p?.className,
        };
      });
    }

    const totalNew = processes.reduce((sum, p) => sum + (p.newMovementsCount || 0), 0);

    const hasRunningDiscovery = (lawyers ?? []).some(
      (l: any) => l.discovery_status === "running" || l.discovery_status === "pending",
    );
    const hasPendingSync = processes.some(
      (p) => p.syncStatus === "pending" || p.syncStatus === "failed",
    );

    return {
      stats: {
        totalProcesses: processes.length,
        totalLawyers: lawyers?.length ?? 0,
        totalNewMovements: totalNew,
      },
      lawyers: lawyers ?? [],
      processes,
      recentNewMovements,
      hasRunningDiscovery: hasRunningDiscovery || hasPendingSync,
    };
  });
