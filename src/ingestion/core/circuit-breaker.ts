/**
 * CircuitBreaker persistido em Postgres (`circuit_breakers`).
 * Compartilhado entre Lovable (server fns) e o worker externo.
 *
 * Threshold: 5 falhas em 5 min → abre por 10 min.
 * Half-open: 1 sonda; sucesso fecha, falha reabre por 20 min.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type BreakerState = "closed" | "open" | "half_open";

export interface BreakerConfig {
  threshold: number;
  windowSec: number;
  openDurationSec: number;
  reopenDurationSec: number;
}

export const DEFAULT_BREAKER_CONFIG: BreakerConfig = {
  threshold: Number(process.env.CIRCUIT_BREAKER_THRESHOLD ?? 5),
  windowSec: Number(process.env.CIRCUIT_BREAKER_WINDOW_SEC ?? 300),
  openDurationSec: Number(process.env.CIRCUIT_BREAKER_OPEN_DURATION_SEC ?? 600),
  reopenDurationSec: Number(process.env.CIRCUIT_BREAKER_REOPEN_DURATION_SEC ?? 1200),
};

export class CircuitBreaker {
  constructor(
    private readonly db: SupabaseClient,
    private readonly cfg: BreakerConfig = DEFAULT_BREAKER_CONFIG,
  ) {}

  async getState(adapter: string): Promise<BreakerState> {
    const { data } = await this.db
      .from("circuit_breakers")
      .select("state, opened_at, half_open_probe_at")
      .eq("adapter", adapter)
      .maybeSingle();

    if (!data) return "closed";

    if (data.state === "open" && data.opened_at) {
      const openedMs = new Date(data.opened_at).getTime();
      if (Date.now() - openedMs > this.cfg.openDurationSec * 1000) {
        await this.db
          .from("circuit_breakers")
          .update({ state: "half_open", half_open_probe_at: new Date().toISOString() })
          .eq("adapter", adapter);
        return "half_open";
      }
      return "open";
    }
    return data.state as BreakerState;
  }

  async isOpen(adapter: string): Promise<boolean> {
    return (await this.getState(adapter)) === "open";
  }

  async recordSuccess(adapter: string): Promise<void> {
    await this.db.from("circuit_breakers").upsert(
      {
        adapter,
        state: "closed",
        failure_count: 0,
        opened_at: null,
        half_open_probe_at: null,
        last_outcome: "success",
        last_error: null,
      },
      { onConflict: "adapter" },
    );
  }

  async recordFailure(adapter: string, errorKind: string, errorMessage: string): Promise<void> {
    const { data } = await this.db
      .from("circuit_breakers")
      .select("state, failure_count, failure_window_started_at")
      .eq("adapter", adapter)
      .maybeSingle();

    const now = Date.now();
    const windowStart = data?.failure_window_started_at
      ? new Date(data.failure_window_started_at).getTime()
      : now;
    const inWindow = now - windowStart <= this.cfg.windowSec * 1000;
    const nextCount = inWindow ? (data?.failure_count ?? 0) + 1 : 1;
    const nextWindowStart = inWindow ? data!.failure_window_started_at! : new Date(now).toISOString();

    const reopen = data?.state === "half_open";
    const shouldOpen = reopen || nextCount >= this.cfg.threshold;

    await this.db.from("circuit_breakers").upsert(
      {
        adapter,
        state: shouldOpen ? "open" : "closed",
        failure_count: nextCount,
        failure_window_started_at: nextWindowStart,
        opened_at: shouldOpen ? new Date(now).toISOString() : null,
        half_open_probe_at: null,
        last_outcome: errorKind,
        last_error: errorMessage.slice(0, 500),
      },
      { onConflict: "adapter" },
    );
  }

  async reset(adapter: string): Promise<void> {
    await this.db.from("circuit_breakers").upsert(
      {
        adapter,
        state: "closed",
        failure_count: 0,
        opened_at: null,
        half_open_probe_at: null,
        last_outcome: "manual_reset",
        last_error: null,
      },
      { onConflict: "adapter" },
    );
  }
}
