/**
 * Busca por OAB no DataJud (índice api_publica_tjrj).
 *
 * Estratégia 2-tentativas:
 *  - tenta query NESTED em partes.representantes
 *  - fallback para FLAT em representantes
 * A variante vencedora é cacheada em memória pelo chamador.
 */
import { maskOABForLog } from "@/types/targets";

const DATAJUD_BASE_URL =
  process.env.DATAJUD_BASE_URL ?? "https://api-publica.datajud.cnj.jus.br";

const RETRY_DELAYS_MS = [1000, 2500, 6000];
const PAGE_SIZE = 100;

export type LawyerSearchVariant = "nested" | "flat";

export interface LawyerSearchHit {
  source: any;
  sort: any[];
}

export interface LawyerSearchPage {
  hits: LawyerSearchHit[];
  totalRelation?: string;
  total?: number;
  variantUsed: LawyerSearchVariant;
  nextCursor: any[] | null;
}

export interface LawyerSearchOptions {
  apiKey: string;
  alias: string; // ex: api_publica_tjrj
  uf: string;
  numero: string;
  searchAfter?: any[] | null;
  preferVariant?: LawyerSearchVariant | null;
}

function jitter(ms: number) {
  return ms + Math.floor(Math.random() * 250);
}
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function nestedQuery(numero: string, uf: string, searchAfter?: any[] | null) {
  return {
    size: PAGE_SIZE,
    sort: [{ "@timestamp": { order: "asc" } }, { _id: { order: "asc" } }],
    query: {
      nested: {
        path: "partes.representantes",
        query: {
          bool: {
            must: [
              { match: { "partes.representantes.numeroOAB": numero } },
              { match: { "partes.representantes.ufOAB": uf } },
            ],
          },
        },
      },
    },
    ...(searchAfter ? { search_after: searchAfter } : {}),
  };
}

function flatQuery(numero: string, uf: string, searchAfter?: any[] | null) {
  return {
    size: PAGE_SIZE,
    sort: [{ "@timestamp": { order: "asc" } }, { _id: { order: "asc" } }],
    query: {
      bool: {
        must: [
          { match: { "representantes.numeroOAB": numero } },
          { match: { "representantes.ufOAB": uf } },
        ],
      },
    },
    ...(searchAfter ? { search_after: searchAfter } : {}),
  };
}

export class LawyerSearchError extends Error {
  constructor(
    message: string,
    public readonly kind: "rate_limited" | "auth" | "upstream" | "client" | "timeout",
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "LawyerSearchError";
  }
}

async function postQuery(apiKey: string, alias: string, body: unknown) {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 25_000);
      const res = await fetch(`${DATAJUD_BASE_URL}/${alias}/_search`, {
        method: "POST",
        headers: {
          Authorization: `APIKey ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      }).finally(() => clearTimeout(t));

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after") ?? 1) * 1000;
        if (attempt === RETRY_DELAYS_MS.length) {
          throw new LawyerSearchError("rate limited", "rate_limited", 429);
        }
        await sleep(jitter(retryAfter));
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        throw new LawyerSearchError(`auth ${res.status}`, "auth", res.status);
      }
      if (res.status >= 500) {
        if (attempt === RETRY_DELAYS_MS.length) {
          throw new LawyerSearchError(`upstream ${res.status}`, "upstream", res.status);
        }
        await sleep(jitter(RETRY_DELAYS_MS[attempt]));
        continue;
      }
      if (res.status >= 400) {
        const txt = await res.text();
        throw new LawyerSearchError(
          `client ${res.status}: ${txt.slice(0, 200)}`,
          "client",
          res.status,
        );
      }
      return await res.json();
    } catch (err) {
      if (err instanceof LawyerSearchError) throw err;
      lastErr = err;
      if ((err as Error)?.name === "AbortError") {
        if (attempt === RETRY_DELAYS_MS.length) {
          throw new LawyerSearchError("timeout", "timeout");
        }
        await sleep(jitter(RETRY_DELAYS_MS[attempt]));
        continue;
      }
      if (attempt === RETRY_DELAYS_MS.length) {
        throw new LawyerSearchError(String(err), "upstream");
      }
      await sleep(jitter(RETRY_DELAYS_MS[attempt]));
    }
  }
  throw new LawyerSearchError(String(lastErr), "upstream");
}

function extractPage(raw: any, variant: LawyerSearchVariant): LawyerSearchPage {
  const hits = (raw?.hits?.hits ?? []) as Array<{ _source: any; sort: any[] }>;
  const total = raw?.hits?.total?.value as number | undefined;
  const totalRelation = raw?.hits?.total?.relation as string | undefined;
  const last = hits[hits.length - 1];
  return {
    hits: hits.map((h) => ({ source: h._source, sort: h.sort })),
    total,
    totalRelation,
    variantUsed: variant,
    nextCursor: last && hits.length === PAGE_SIZE ? last.sort : null,
  };
}

export async function searchByOab(
  opts: LawyerSearchOptions,
): Promise<LawyerSearchPage> {
  const { apiKey, alias, uf, numero, searchAfter, preferVariant } = opts;

  // Se já temos preferência, vai direto
  if (preferVariant) {
    const body =
      preferVariant === "nested"
        ? nestedQuery(numero, uf, searchAfter)
        : flatQuery(numero, uf, searchAfter);
    const raw = await postQuery(apiKey, alias, body);
    return extractPage(raw, preferVariant);
  }

  // Probe: tenta nested primeiro
  const rawNested = await postQuery(apiKey, alias, nestedQuery(numero, uf, searchAfter));
  const page = extractPage(rawNested, "nested");
  if (page.hits.length > 0 || (page.total ?? 0) > 0) return page;

  // Fallback: flat
  const rawFlat = await postQuery(apiKey, alias, flatQuery(numero, uf, searchAfter));
  return extractPage(rawFlat, "flat");
}

export function logProbe(uf: string, numero: string, variant: LawyerSearchVariant) {
  const oab = `${uf}${numero}`;
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "info",
      event: "lawyer_search_variant",
      oab: maskOABForLog(oab),
      variant,
    }),
  );
}
