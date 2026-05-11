/**
 * Schema canônico de saída do módulo de captação.
 * Toda fonte (DataJud, e-SAJ, e-Proc...) produz exatamente este formato.
 */
import { z } from "zod";

export const PartyPoloSchema = z.enum(["ativo", "passivo", "interessado"]);
export type PartyPolo = z.infer<typeof PartyPoloSchema>;

export const CanonicalPartySchema = z.object({
  name: z.string().min(1),
  nameNormalized: z.string().min(1),
  polo: PartyPoloSchema,
  document: z
    .object({
      kind: z.enum(["cpf", "cnpj", "unknown"]),
      hash: z.string().nullable(),
    })
    .nullable(),
  qualification: z.string().nullable(),
  isPublicEntity: z.boolean(),
});
export type CanonicalParty = z.infer<typeof CanonicalPartySchema>;

export const CanonicalMovementSchema = z.object({
  cnjMovementId: z.string().min(1),
  occurredAt: z.string().datetime({ offset: true }),
  code: z.number().int().nullable(),
  text: z.string(),
  raw: z.record(z.string(), z.unknown()).optional(),
});
export type CanonicalMovement = z.infer<typeof CanonicalMovementSchema>;

export const CanonicalProcessSchema = z.object({
  processNumber: z.string().regex(/^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/, {
    message: "processNumber deve estar no padrão CNJ",
  }),
  tribunalAlias: z.string().min(1),
  classCode: z.number().int().nullable(),
  className: z.string().nullable(),
  subjectCodes: z.array(z.number().int()),
  parties: z.array(CanonicalPartySchema),
  movements: z.array(CanonicalMovementSchema),
  movementsHash: z.string().length(64),
  fetchedAt: z.string().datetime({ offset: true }),
  source: z.enum(["datajud", "tjsp_esaj", "manual"]),
});
export type CanonicalProcess = z.infer<typeof CanonicalProcessSchema>;

export type AdapterErrorKind =
  | "not_found"
  | "rate_limited"
  | "blocked"
  | "auth_failed"
  | "source_unavailable"
  | "parse_failed"
  | "timeout";

export class AdapterError extends Error {
  constructor(
    public readonly kind: AdapterErrorKind,
    message: string,
    public readonly meta: {
      adapter?: string;
      retryAfterMs?: number;
      httpStatus?: number;
      rawSnippet?: string;
    } = {},
  ) {
    super(message);
    this.name = "AdapterError";
  }

  static notFound(msg = "process not found", meta?: AdapterError["meta"]) {
    return new AdapterError("not_found", msg, meta);
  }
  static rateLimited(retryAfterMs: number, meta: AdapterError["meta"] = {}) {
    return new AdapterError("rate_limited", "rate limited", { ...meta, retryAfterMs });
  }
  static blocked(msg: string, meta?: AdapterError["meta"]) {
    return new AdapterError("blocked", msg, meta);
  }
  static authFailed(msg: string, meta?: AdapterError["meta"]) {
    return new AdapterError("auth_failed", msg, meta);
  }
  static sourceUnavailable(msg: string, meta?: AdapterError["meta"]) {
    return new AdapterError("source_unavailable", msg, meta);
  }
  static parseFailed(msg: string, meta?: AdapterError["meta"]) {
    return new AdapterError("parse_failed", msg, meta);
  }
  static timeout(msg = "timeout", meta?: AdapterError["meta"]) {
    return new AdapterError("timeout", msg, meta);
  }
}

export type FetchProcessOptions = {
  processNumber: string;
  tribunal: string;
  forceFresh?: boolean;
  correlationId?: string;
};

export type SearchCriteria = {
  tribunal: string;
  classCodes?: number[];
  keywords?: string[];
  partyName?: string;
  cpfHash?: string;
  pageSize?: number;
  cursor?: string;
};

export type SearchResult = {
  hits: Array<{ processNumber: string; tribunal: string }>;
  nextCursor: string | null;
};

export interface ProcessSourceAdapter {
  readonly kind: "datajud" | "tjsp_esaj";
  supports(tribunal: string): boolean;
  fetchProcess(opts: FetchProcessOptions): Promise<CanonicalProcess>;
  searchProcesses?(criteria: SearchCriteria): Promise<SearchResult>;
}
