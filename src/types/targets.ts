export type TargetType = "person" | "process" | "radar" | "lawyer";

export type DiscoveryStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "partial";

export type DiscoveryTrigger = "initial" | "periodic_refresh" | "manual";

export interface LawyerTarget {
  id: string;
  user_id: string;
  type: "lawyer";
  lawyer_name: string;
  oab_numbers: string[];
  include_inactive: boolean;
  tribunal_scope: string[];
  auto_discovered: boolean;
  last_discovery_at: string | null;
  discovery_status: DiscoveryStatus | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DiscoveryRun {
  id: string;
  target_id: string;
  user_id: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "completed" | "failed" | "partial";
  total_found: number;
  by_tribunal: Record<string, number>;
  by_oab: Record<string, number>;
  errors: Record<string, string> | null;
  triggered_by: DiscoveryTrigger;
}

export interface CreateLawyerTargetPayload {
  type: "lawyer";
  lawyer_name: string;
  oab_numbers: string[];
  include_inactive?: boolean;
}

export const OAB_REGEX = /^[A-Z]{2}\d{3,7}$/;

export function normalizeOAB(input: string): string {
  return String(input || "")
    .toUpperCase()
    .replace(/[\s.\-/]/g, "")
    .trim();
}

export function isValidOAB(oab: string): boolean {
  return OAB_REGEX.test(oab);
}

export function formatOABDisplay(oab: string): string {
  if (!isValidOAB(oab)) return oab;
  const uf = oab.slice(0, 2);
  const num = oab.slice(2);
  // Group thousands from the right
  const grouped = num.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${uf} ${grouped}`;
}

export function maskOABForLog(oab: string): string {
  if (!isValidOAB(oab)) return "***";
  const uf = oab.slice(0, 2);
  const tail = oab.slice(-3);
  return `${uf} ***${tail}`;
}
