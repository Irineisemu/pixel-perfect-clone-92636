/**
 * SourceRouter: orquestra adapters elegíveis com fallback e circuit breaker.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { CircuitBreaker } from "./circuit-breaker";
import { AdapterError, type CanonicalProcess, type FetchProcessOptions, type ProcessSourceAdapter } from "./types";

export type RouteResult = {
  process: CanonicalProcess;
  adapterUsed: string;
  attempts: Array<{ adapter: string; outcome: string; durationMs: number; errorKind?: string }>;
};

export class IngestionError extends Error {
  constructor(
    message: string,
    public readonly attempts: RouteResult["attempts"],
  ) {
    super(message);
    this.name = "IngestionError";
  }
}

export class SourceRouter {
  private readonly breaker: CircuitBreaker;

  constructor(
    private readonly adapters: ProcessSourceAdapter[],
    db: SupabaseClient,
  ) {
    this.breaker = new CircuitBreaker(db);
  }

  async route(opts: FetchProcessOptions): Promise<RouteResult> {
    const eligible = this.adapters.filter((a) => a.supports(opts.tribunal));
    if (eligible.length === 0) {
      throw new IngestionError(`no adapter supports tribunal ${opts.tribunal}`, []);
    }

    const attempts: RouteResult["attempts"] = [];

    for (const adapter of eligible) {
      if (await this.breaker.isOpen(adapter.kind)) {
        attempts.push({ adapter: adapter.kind, outcome: "circuit_open", durationMs: 0 });
        continue;
      }

      const start = Date.now();
      try {
        const process = await adapter.fetchProcess(opts);
        const durationMs = Date.now() - start;
        attempts.push({ adapter: adapter.kind, outcome: "success", durationMs });
        await this.breaker.recordSuccess(adapter.kind);
        return { process, adapterUsed: adapter.kind, attempts };
      } catch (err) {
        const durationMs = Date.now() - start;
        if (err instanceof AdapterError) {
          attempts.push({
            adapter: adapter.kind,
            outcome: err.kind,
            durationMs,
            errorKind: err.kind,
          });

          // not_found / rate_limited NÃO contam pro breaker
          if (err.kind === "blocked" || err.kind === "auth_failed" || err.kind === "source_unavailable" || err.kind === "timeout") {
            await this.breaker.recordFailure(adapter.kind, err.kind, err.message);
          }
          // parse_failed: registra mas não quebra breaker (provavelmente bug de mapper)
          continue;
        }
        attempts.push({
          adapter: adapter.kind,
          outcome: "unexpected_error",
          durationMs,
          errorKind: "unexpected",
        });
        await this.breaker.recordFailure(adapter.kind, "unexpected", String(err));
      }
    }

    throw new IngestionError("all sources failed", attempts);
  }
}
