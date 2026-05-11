/**
 * DataJudAdapter — fonte primária. Roda dentro do Lovable (Worker).
 * Usa fetch nativo (sem deps Node-only).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AdapterError,
  type CanonicalProcess,
  type FetchProcessOptions,
  type ProcessSourceAdapter,
  type SearchCriteria,
  type SearchResult,
} from "../../core/types";
import { resolveAlias, supportsTribunal } from "./aliases";
import { byProcessNumber, buildSearch, encodeCursor } from "./query-builder";
import { toCanonical } from "./mapper";

const DATAJUD_BASE_URL =
  process.env.DATAJUD_BASE_URL ?? "https://api-publica.datajud.cnj.jus.br";

const RETRY_DELAYS_MS = [1000, 2500, 6000];
const CACHE_TTL_SEC = 25 * 60;
const RATE_LIMIT_CAPACITY = 60;
const RATE_LIMIT_REFILL = 60 / 60; // 60 req/min

const MOCK = process.env.MOCK_DATAJUD === "true";

function jitter(ms: number) {
  return ms + Math.floor(Math.random() * 250);
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export interface DatajudAdapterDeps {
  db: SupabaseClient;
  apiKey: string;
}

export class DataJudAdapter implements ProcessSourceAdapter {
  readonly kind = "datajud" as const;

  constructor(private readonly deps: DatajudAdapterDeps) {}

  supports(tribunal: string): boolean {
    return supportsTribunal(tribunal);
  }

  async fetchProcess(opts: FetchProcessOptions): Promise<CanonicalProcess> {
    const alias = resolveAlias(opts.tribunal);
    if (!alias) throw AdapterError.notFound(`alias DataJud não encontrado para ${opts.tribunal}`);

    const cacheKey = `datajud:${alias}:${opts.processNumber}`;
    if (!opts.forceFresh) {
      const cached = await this.readCache(cacheKey);
      if (cached) return cached;
    }

    if (MOCK) {
      const mocked = await this.loadMockFixture(opts.processNumber);
      const canonical = await toCanonical(mocked, alias);
      await this.writeCache(cacheKey, canonical);
      return canonical;
    }

    await this.checkRateLimit();
    const raw = await this.requestWithRetry(`${DATAJUD_BASE_URL}/${alias}/_search`, byProcessNumber(opts.processNumber));

    const hit = raw?.hits?.hits?.[0]?._source;
    if (!hit) throw AdapterError.notFound(`processo ${opts.processNumber} não encontrado em ${alias}`);

    const canonical = await toCanonical(hit, alias);
    await this.writeCache(cacheKey, canonical);
    await this.persistRaw(opts, raw, alias);
    return canonical;
  }

  async searchProcesses(criteria: SearchCriteria): Promise<SearchResult> {
    const alias = resolveAlias(criteria.tribunal);
    if (!alias) return { hits: [], nextCursor: null };

    if (MOCK) return { hits: [], nextCursor: null };

    await this.checkRateLimit();
    const body = buildSearch({
      classCodes: criteria.classCodes,
      partyName: criteria.partyName,
      pageSize: criteria.pageSize,
      cursor: criteria.cursor,
    });
    const raw = await this.requestWithRetry(`${DATAJUD_BASE_URL}/${alias}/_search`, body);
    const hits = (raw?.hits?.hits ?? []) as Array<{ _source: { numeroProcesso: string }; sort: unknown[] }>;
    return {
      hits: hits.map((h) => ({
        processNumber: h._source.numeroProcesso,
        tribunal: criteria.tribunal,
      })),
      nextCursor: hits.length ? encodeCursor(hits[hits.length - 1].sort) : null,
    };
  }

  // ---------- internals ----------

  private async checkRateLimit() {
    const { data, error } = await this.deps.db.rpc("consume_rate_limit", {
      _key: "datajud:global",
      _capacity: RATE_LIMIT_CAPACITY,
      _refill_per_sec: RATE_LIMIT_REFILL,
      _tokens: 1,
    });
    if (error) {
      // Falha no rate-limit não derruba; loga e segue
      console.warn("[datajud] consume_rate_limit error", error);
      return;
    }
    if (data === false) {
      throw AdapterError.rateLimited(2000, { adapter: "datajud" });
    }
  }

  private async requestWithRetry(url: string, body: unknown): Promise<any> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 20_000);
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `APIKey ${this.deps.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        }).finally(() => clearTimeout(t));

        if (res.status === 429) {
          const retryAfter = Number(res.headers.get("retry-after") ?? 1) * 1000;
          if (attempt === RETRY_DELAYS_MS.length) throw AdapterError.rateLimited(retryAfter);
          await sleep(jitter(retryAfter));
          continue;
        }
        if (res.status === 401 || res.status === 403) {
          throw AdapterError.authFailed(`DataJud auth ${res.status}`, { httpStatus: res.status });
        }
        if (res.status >= 500) {
          if (attempt === RETRY_DELAYS_MS.length) {
            throw AdapterError.sourceUnavailable(`DataJud ${res.status}`, { httpStatus: res.status });
          }
          await sleep(jitter(RETRY_DELAYS_MS[attempt]));
          continue;
        }
        if (res.status >= 400) {
          const txt = await res.text();
          throw AdapterError.parseFailed(`DataJud ${res.status}`, {
            httpStatus: res.status,
            rawSnippet: txt.slice(0, 300),
          });
        }
        return await res.json();
      } catch (err) {
        if (err instanceof AdapterError) throw err;
        lastErr = err;
        if ((err as Error)?.name === "AbortError") {
          if (attempt === RETRY_DELAYS_MS.length) throw AdapterError.timeout("DataJud timeout");
          await sleep(jitter(RETRY_DELAYS_MS[attempt]));
          continue;
        }
        if (attempt === RETRY_DELAYS_MS.length) {
          throw AdapterError.sourceUnavailable(String(err));
        }
        await sleep(jitter(RETRY_DELAYS_MS[attempt]));
      }
    }
    throw AdapterError.sourceUnavailable(String(lastErr));
  }

  private async readCache(key: string): Promise<CanonicalProcess | null> {
    const { data } = await this.deps.db
      .from("datajud_cache")
      .select("payload, expires_at")
      .eq("cache_key", key)
      .maybeSingle();
    if (!data) return null;
    if (new Date(data.expires_at).getTime() < Date.now()) return null;
    return data.payload as CanonicalProcess;
  }

  private async writeCache(key: string, payload: CanonicalProcess) {
    const expiresAt = new Date(Date.now() + CACHE_TTL_SEC * 1000).toISOString();
    await this.deps.db.from("datajud_cache").upsert({ cache_key: key, payload, expires_at: expiresAt });
  }

  private async persistRaw(opts: FetchProcessOptions, raw: unknown, alias: string) {
    await this.deps.db.from("raw_payloads").insert({
      source: "datajud",
      process_number: opts.processNumber,
      tribunal: alias,
      payload: raw as object,
      correlation_id: opts.correlationId ?? null,
    });
  }

  private async loadMockFixture(processNumber: string): Promise<unknown> {
    // Fixture inline simples para desenvolvimento sem chave
    return {
      numeroProcesso: processNumber.replace(/\D/g, ""),
      classe: { codigo: 436, nome: "Procedimento Comum Cível" },
      assuntos: [{ codigo: 1127 }],
      partes: [
        {
          polo: "AT",
          pessoa: { nome: "Fulano de Tal", tipoPessoa: "FISICA" },
        },
        {
          polo: "PA",
          pessoa: { nome: "Estado de São Paulo", tipoPessoa: "JURIDICA" },
        },
      ],
      movimentos: [
        { codigo: 26, nome: "Distribuição", dataHora: "2024-01-15T10:00:00Z" },
        { codigo: 51, nome: "Citação", dataHora: "2024-02-20T14:30:00Z" },
      ],
    };
  }
}
