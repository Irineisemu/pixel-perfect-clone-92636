/**
 * Mapper DataJud → CanonicalProcess.
 */
import { z } from "zod";
import { detectPublicEntity, movementsHash, normalizeName } from "../../core/hash";
import {
  AdapterError,
  CanonicalProcessSchema,
  type CanonicalMovement,
  type CanonicalParty,
  type CanonicalProcess,
} from "../../core/types";

const DatajudHitSchema = z.object({
  numeroProcesso: z.string(),
  classe: z
    .object({ codigo: z.number().nullable().optional(), nome: z.string().nullable().optional() })
    .nullable()
    .optional(),
  assuntos: z
    .array(z.object({ codigo: z.number().nullable().optional() }))
    .nullable()
    .optional(),
  partes: z
    .array(
      z.object({
        polo: z.string().optional(),
        // Formato novo: campos na raiz da parte
        nome: z.string().optional(),
        tipoPessoa: z.string().optional(),
        documento: z
          .array(z.object({ tipo: z.string(), numero: z.string() }))
          .optional(),
        qualificacaoEmProcesso: z.string().optional(),
        // Formato legacy: campos aninhados em "pessoa"
        pessoa: z
          .object({
            nome: z.string().optional(),
            tipoPessoa: z.string().optional(),
            documento: z
              .array(z.object({ tipo: z.string(), numero: z.string() }))
              .optional(),
            qualificacaoEmProcesso: z.string().optional(),
          })
          .optional(),
        // Representantes/advogados — campo crítico que estava ausente
        representantes: z
          .array(
            z.object({
              nome: z.string().optional(),
              numeroOAB: z.string().optional(),
              ufOAB: z.string().optional(),
              tipoOAB: z.string().optional(),
            }),
          )
          .optional(),
      }),
    )
    .nullable()
    .optional(),
  movimentos: z
    .array(
      z.object({
        codigo: z.number().nullable().optional(),
        nome: z.string().nullable().optional(),
        dataHora: z.string().nullable().optional(),
      }),
    )
    .nullable()
    .optional(),
});

export type DatajudHit = z.infer<typeof DatajudHitSchema>;

function parseDate(input: string | null | undefined): string | null {
  if (!input) return null;
  // DataJud retorna formatos variados: ISO com Z, ISO sem timezone, "yyyy-mm-dd HH:MM:SS"
  const cleaned = input.includes("T") ? input : input.replace(" ", "T");
  const withTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(cleaned) ? cleaned : `${cleaned}-03:00`;
  const d = new Date(withTz);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().replace("Z", "+00:00");
}

function mapPolo(input: string | undefined): CanonicalParty["polo"] {
  switch ((input ?? "").toUpperCase()) {
    case "AT":
    case "ATIVO":
      return "ativo";
    case "PA":
    case "PASSIVO":
      return "passivo";
    default:
      return "interessado";
  }
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function formatProcessNumber(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length !== 20) return raw;
  return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16)}`;
}

export async function toCanonical(
  hit: unknown,
  tribunalAlias: string,
  source: CanonicalProcess["source"] = "datajud",
): Promise<CanonicalProcess> {
  const parsed = DatajudHitSchema.safeParse(hit);
  if (!parsed.success) {
    throw AdapterError.parseFailed("DataJud hit shape inválido", {
      adapter: "datajud",
      rawSnippet: JSON.stringify(parsed.error.issues).slice(0, 500),
    });
  }
  const h = parsed.data;

  const parties: CanonicalParty[] = (h.partes ?? []).map((p) => {
    // Tenta formato novo (raiz) primeiro, cai para formato legacy (pessoa.nome)
    const name = (p.nome ?? p.pessoa?.nome ?? "").trim();
    const docs = p.documento ?? p.pessoa?.documento ?? [];
    const qualification =
      p.qualificacaoEmProcesso ?? p.pessoa?.qualificacaoEmProcesso ?? null;
    const cpfCnpj = docs[0];
    return {
      name,
      nameNormalized: normalizeName(name),
      polo: mapPolo(p.polo),
      document: cpfCnpj
        ? {
            kind: cpfCnpj.tipo?.toLowerCase().includes("cnpj") ? "cnpj" : "cpf",
            hash: null,
          }
        : null,
      qualification,
      isPublicEntity: detectPublicEntity(name),
      representatives: (p.representantes ?? [])
        .map((r: any) => ({
          name: (r.nome ?? "").trim(),
          oabNumber: r.numeroOAB ?? null,
          oabUf: r.ufOAB ?? null,
        }))
        .filter((r: any) => r.name),
    } as any;
  });

  const movements: CanonicalMovement[] = await Promise.all(
    (h.movimentos ?? []).map(async (m, idx) => {
      const occurredAt = parseDate(m.dataHora) ?? new Date(0).toISOString().replace("Z", "+00:00");
      const idBase = `${m.codigo ?? "x"}|${occurredAt}|${m.nome ?? ""}|${idx}`;
      return {
        cnjMovementId: await sha256Hex(idBase),
        occurredAt,
        code: m.codigo ?? null,
        text: m.nome ?? "",
      };
    }),
  );

  const hash = await movementsHash(movements);

  const canonical: CanonicalProcess = {
    processNumber: formatProcessNumber(h.numeroProcesso),
    tribunalAlias,
    classCode: h.classe?.codigo ?? null,
    className: h.classe?.nome ?? null,
    subjectCodes: (h.assuntos ?? []).map((a) => a.codigo).filter((x): x is number => typeof x === "number"),
    parties,
    movements,
    movementsHash: hash,
    fetchedAt: new Date().toISOString().replace("Z", "+00:00"),
    source,
  };

  // Validação final — qualquer drift do schema lança parse_failed
  const result = CanonicalProcessSchema.safeParse(canonical);
  if (!result.success) {
    throw AdapterError.parseFailed("CanonicalProcess validation failed", {
      adapter: "datajud",
      rawSnippet: JSON.stringify(result.error.issues).slice(0, 500),
    });
  }
  return result.data;
}
