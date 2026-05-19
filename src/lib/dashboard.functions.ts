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

    // 1. Get total counts directly for accurate stats
    const { data: counts } = await sb.rpc('get_dashboard_stats');
    // If RPC doesn't exist, we'll fall back to manual queries or just use what we have, 
    // but let's check if we can add an RPC or just do the queries here.
    
    const { count: totalProcesses } = await sb
      .from("target_process_links")
      .select("*", { count: "exact", head: true })
      .is("unlinked_at", null);

    const { count: totalNewMovements } = await sb
      .from("process_movements")
      .select("*", { count: "exact", head: true })
      .eq("is_new", true);

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
        target:monitoring_targets!inner(id, lawyer_name, nickname, type, source_type, is_active),
        process:processes!inner(
          id, process_number, tribunal_alias,
          class_code, class_name, subject_codes, subject_names,
          instance, sync_status,
          last_synced_at, last_movement_at,
          total_movements, new_movements_count,
          filed_at, organ_code, organ_name,
          municipality_ibge, secrecy_level,
          system_name, format_name, last_update_at,
          parties_json
        )
        `,
      )
      .is("unlinked_at", null)
      .eq("target.is_active", true)
      .order("first_linked_at", { ascending: false })
      .limit(100);

    const secrecyMap: Record<number, string> = {
      0: "Público",
      1: "Segredo",
      2: "Sigilo absoluto",
      3: "Sigilo médio",
      4: "Sigilo intenso",
      5: "Sigilo máximo",
    };

    // Última movimentação por processo
    const allProcessIds = ((linkRows ?? []) as any[]).map((r) => r.process.id);
    const lastMovementByProcess: Record<string, any> = {};
    if (allProcessIds.length > 0) {
      const { data: lastMovs } = await sb
        .from("process_movements")
        .select("process_id, movement_name, occurred_at, organ_name")
        .in("process_id", allProcessIds)
        .order("occurred_at", { ascending: false });
      for (const m of (lastMovs ?? []) as any[]) {
        if (!lastMovementByProcess[m.process_id]) lastMovementByProcess[m.process_id] = m;
      }
    }

    const processes = (linkRows ?? []).map((r: any) => {
      const p = r.process;
      const codes: number[] = p.subject_codes ?? [];
      const names: string[] = p.subject_names ?? [];
      const subjects = codes.map((code, i) => ({ code, name: names[i] ?? null }));
      const lm = lastMovementByProcess[p.id];
      return {
        id: p.id,
        processNumber: p.process_number,
        displayNumber: formatProcessNumber(p.process_number),
        tribunal: p.tribunal_alias === "api_publica_tjrj" ? "TJRJ" : p.tribunal_alias,
        classCode: p.class_code,
        className: p.class_name,
        subjectCodes: codes,
        subjects,
        instance: p.instance,
        instanceLabel:
          p.instance === 1 ? "1ª Instância" : p.instance === 2 ? "2ª Instância" : p.instance ? "Superior" : null,
        organCode: p.organ_code,
        organName: p.organ_name,
        municipalityIbge: p.municipality_ibge,
        filedAt: p.filed_at,
        lastUpdateAt: p.last_update_at,
        secrecyLevel: p.secrecy_level ?? 0,
        secrecyLabel: secrecyMap[p.secrecy_level ?? 0] ?? "Desconhecido",
        systemName: p.system_name,
        formatName: p.format_name,
        syncStatus: p.sync_status ?? "pending",
        lastSyncedAt: p.last_synced_at,
        lastMovementAt: p.last_movement_at,
        totalMovements: p.total_movements ?? 0,
        newMovementsCount: p.new_movements_count ?? 0,
        lastMovement: lm
          ? { name: lm.movement_name, occurredAt: lm.occurred_at, organName: lm.organ_name }
          : null,
        parties: p.parties_json ?? null,
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
      };
    });

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

    // Process-type targets pending scrape (still not linked to a process row)
    const linkedTargetIds = new Set(((linkRows ?? []) as any[]).map((r) => r.target.id));
    const { data: pendingProcessTargets } = await sb
      .from("monitoring_targets")
      .select("id, process_number, nickname, tribunal_alias, discovery_status, source_type, created_at")
      .eq("type", "process")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    const pendingProcesses = ((pendingProcessTargets ?? []) as any[])
      .filter((t) => !linkedTargetIds.has(t.id))
      .map((t) => ({
        targetId: t.id,
        processNumber: t.process_number,
        displayNumber: formatProcessNumber(t.process_number),
        tribunal: t.tribunal_alias === "api_publica_tjrj" ? "TJRJ" : t.tribunal_alias ?? "—",
        nickname: t.nickname,
        sourceType: t.source_type,
        discoveryStatus: t.discovery_status ?? "pending",
        createdAt: t.created_at,
      }));

    const hasRunningDiscovery = (lawyers ?? []).some(
      (l: any) => l.discovery_status === "running" || l.discovery_status === "pending",
    );
    const hasPendingSync = processes.some(
      (p) => p.syncStatus === "pending" || p.syncStatus === "failed",
    );

    return {
      stats: {
        totalProcesses: totalProcesses ?? 0,
        totalLawyers: lawyers?.length ?? 0,
        totalNewMovements: totalNewMovements ?? 0,
      },
      lawyers: lawyers ?? [],
      processes,
      pendingProcesses,
      recentNewMovements,
      hasRunningDiscovery: hasRunningDiscovery || hasPendingSync || pendingProcesses.length > 0,
    };
  });
