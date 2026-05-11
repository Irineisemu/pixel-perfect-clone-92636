/**
 * Helpers determinísticos compartilhados pelos adapters.
 */
import type { CanonicalMovement, CanonicalParty } from "./types";

const PUBLIC_ENTITY_PATTERNS: RegExp[] = [
  /\b(uni[aã]o federal|fazenda (?:p[uú]blica|nacional|estadual|municipal))\b/i,
  /\b(estado d[eo] [a-z\u00C0-\u017F ]+|munic[ií]pio d[eo] [a-z\u00C0-\u017F ]+)\b/i,
  /\b(autarquia|fundac[aã]o p[uú]blica|empresa p[uú]blica|sociedade de economia mista)\b/i,
  /\b(inss|inmetro|ibama|anvisa|aneel|anatel|funai|ibge|cade|bacen|banco central)\b/i,
  /\b(minist[eé]rio p[uú]blico|defensoria p[uú]blica|advocacia[- ]geral)\b/i,
  /\b(receita federal|caixa econ[oô]mica federal|petrobras|eletrobras|correios)\b/i,
];

export function detectPublicEntity(name: string): boolean {
  if (!name) return false;
  return PUBLIC_ENTITY_PATTERNS.some((re) => re.test(name));
}

export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * SHA-256 hex (Web Crypto, disponível no Worker e no Node 20+).
 */
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Hash determinístico de movimentos: ordena por (occurredAt, cnjMovementId)
 * e serializa apenas os campos canônicos (sem `raw`).
 */
export async function movementsHash(movements: CanonicalMovement[]): Promise<string> {
  const sorted = [...movements].sort((a, b) => {
    if (a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt ? -1 : 1;
    return a.cnjMovementId < b.cnjMovementId ? -1 : a.cnjMovementId > b.cnjMovementId ? 1 : 0;
  });
  const canonical = sorted.map((m) => ({
    id: m.cnjMovementId,
    at: m.occurredAt,
    code: m.code,
    text: m.text,
  }));
  return sha256Hex(JSON.stringify(canonical));
}

export function diffNewMovements(
  previousHash: string | null,
  current: CanonicalMovement[],
  knownIds: Set<string>,
): CanonicalMovement[] {
  if (!previousHash) return current;
  return current.filter((m) => !knownIds.has(m.cnjMovementId));
}

export function buildPartyHashKey(party: Pick<CanonicalParty, "nameNormalized" | "polo">): string {
  return `${party.polo}:${party.nameNormalized}`;
}
