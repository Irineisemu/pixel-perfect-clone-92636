/**
 * TJRJAdapter (PJe TJRJ) — segue o mesmo padrão do TJSP.
 * Foco: consulta pública 2º grau. 1º grau exige login (OAB+senha) e é tratado
 * apenas quando o job vier com `payload.credentials` injetadas pelo worker.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { browserPool, checkRobots } from "../../browser-pool.js";
import selectors from "./selectors.json" with { type: "json" };

const RAW_PATH = process.env.RAW_PAYLOAD_LOCAL_PATH ?? "/var/lib/jusradar/raw";

export type TJRJRaw = {
  processNumber: string;
  className: string | null;
  partes: Array<{ name: string; polo: string }>;
  movimentos: Array<{ text: string; occurredAt: string }>;
};

export type TJRJCredentials = {
  oab_number: string;
  oab_uf: string;
  password: string;
};

export type TJRJScrapeKind =
  | "blocked"
  | "not_found"
  | "parse_failed"
  | "timeout"
  | "source_unavailable"
  | "auth_required"
  | "auth_failed"
  | "captcha_required";

export class TJRJScrapeError extends Error {
  constructor(public kind: TJRJScrapeKind, msg: string) {
    super(msg);
  }
}

function isBlockedTitle(title: string): boolean {
  const t = (title || "").toLowerCase();
  return (selectors.blocked.titlePatterns as string[]).some((p) => t.includes(p));
}

function isCaptcha(html: string): boolean {
  const h = html.toLowerCase();
  return (
    h.includes("recaptcha") ||
    h.includes("hcaptcha") ||
    h.includes("g-recaptcha") ||
    h.includes("cf-challenge") ||
    h.includes("cf_chl_") ||
    h.includes("challenge-platform") ||
    h.includes("verifique se voc") || // "Verifique se você é humano"
    h.includes("prove que voc") ||
    h.includes("não sou um rob") ||
    h.includes("nao sou um rob")
  );
}

// Mensagens típicas do PJe TJRJ quando o login falha.
const AUTH_FAIL_PATTERNS = [
  /usu[aá]rio\s+ou\s+senha\s+(inv[aá]lid|incorret)/i,
  /credenciais?\s+inv[aá]lid/i,
  /senha\s+(inv[aá]lid|incorret)/i,
  /oab\s+(inv[aá]lid|n[aã]o\s+encontrad)/i,
  /login\s+(inv[aá]lid|falh)/i,
  /falha\s+(no\s+)?login/i,
  /autentica[cç][aã]o\s+(inv[aá]lid|falh)/i,
];

function looksLikeAuthFailure(text: string): boolean {
  return AUTH_FAIL_PATTERNS.some((rx) => rx.test(text));
}

/**
 * Descobre se o processo é 1º ou 2º grau pelo CNJ.
 * Posições 14-15 (NNNNNNN-DD.AAAA.J.TR.OOOO) — TR (tribunal) e OOOO (origem).
 * Para PJe TJRJ: 2º grau usa OOOO=0000 (originário do tribunal).
 */
function isSecondInstance(processNumber: string): boolean {
  const digits = processNumber.replace(/\D/g, "");
  if (digits.length < 20) return false;
  const origin = digits.slice(16, 20); // OOOO
  return origin === "0000";
}

export async function scrapeTJRJ(
  processNumber: string,
  credentials: TJRJCredentials | null,
): Promise<TJRJRaw> {
  const secondInstance = isSecondInstance(processNumber);

  if (!secondInstance && !credentials) {
    // 1º grau sem credencial → não dá pra raspar pública confiavelmente
    throw new TJRJScrapeError("auth_required", "1º grau TJRJ requer credenciais OAB");
  }

  const targetUrl = secondInstance
    ? selectors.consultaPublica2g.url
    : selectors.consultaPublica1g.url;
  const allowed = await checkRobots(targetUrl);
  if (!allowed) throw new TJRJScrapeError("blocked", "robots.txt disallow");

  const entry = await browserPool.acquire("pje.tjrj.jus.br");
  const page = await entry.context.newPage();
  try {
    if (!secondInstance && credentials) {
      await loginPje(page, credentials);
    }

    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });

    const title = await page.title();
    if (isBlockedTitle(title)) throw new TJRJScrapeError("blocked", `block page: ${title}`);
    const initialHtml = await page.content();
    if (isCaptcha(initialHtml)) throw new TJRJScrapeError("captcha_required", "captcha detected");

    const inputSel = secondInstance
      ? selectors.consultaPublica2g.input
      : selectors.consultaPublica1g.input;
    const submitSel = secondInstance
      ? selectors.consultaPublica2g.submit
      : selectors.consultaPublica1g.submit;

    await page.fill(inputSel, processNumber).catch(() => {
      throw new TJRJScrapeError("parse_failed", `campo de busca não encontrado (${inputSel})`);
    });

    await Promise.all([
      page.waitForLoadState("domcontentloaded", { timeout: 30_000 }),
      page.click(submitSel),
    ]);

    const html = await page.content();
    if (isCaptcha(html)) throw new TJRJScrapeError("captcha_required", "captcha after submit");
    if (/nenhum\s+(processo|registro)\s+encontrado/i.test(html)) {
      throw new TJRJScrapeError("not_found", "process not found");
    }

    // Abre o detalhe (primeiro link)
    const detailLink = page.locator(selectors.consultaPublica2g.detailLink).first();
    if (await detailLink.count()) {
      await Promise.all([
        page.waitForLoadState("domcontentloaded", { timeout: 30_000 }),
        detailLink.click(),
      ]);
    }

    const className = await page
      .locator(selectors.process.classe)
      .first()
      .textContent()
      .catch(() => null);

    const partes = await page
      .$$eval(`${selectors.process.partesTable} tr`, (rows) =>
        rows
          .map((r) => {
            const cells = Array.from(r.querySelectorAll("td"));
            const polo = cells[0]?.textContent?.trim() ?? "";
            const name = cells[1]?.textContent?.trim() ?? "";
            return { polo, name };
          })
          .filter((p) => p.name),
      )
      .catch(() => [] as Array<{ name: string; polo: string }>);

    const movimentos = await page
      .$$eval(`${selectors.process.movimentacoesTable} tr`, (rows) =>
        rows
          .map((r) => {
            const cells = Array.from(r.querySelectorAll("td"));
            const date = cells[0]?.textContent?.trim() ?? "";
            const text = cells.slice(1).map((c) => c.textContent?.trim() ?? "").join(" ").trim();
            return { occurredAt: date, text };
          })
          .filter((m) => m.text && /\d{2}\/\d{2}\/\d{4}/.test(m.occurredAt)),
      )
      .catch(() => [] as Array<{ text: string; occurredAt: string }>);

    if (!movimentos.length && !partes.length) {
      throw new TJRJScrapeError("parse_failed", "nenhum dado extraído (selectors podem ter mudado)");
    }

    const raw: TJRJRaw = {
      processNumber,
      className: className?.trim() ?? null,
      partes,
      movimentos,
    };

    await persistRaw(processNumber, raw);
    return raw;
  } catch (err) {
    if (err instanceof TJRJScrapeError) throw err;
    if ((err as Error).message?.includes("Timeout")) {
      throw new TJRJScrapeError("timeout", String((err as Error).message));
    }
    throw new TJRJScrapeError("source_unavailable", String((err as Error).message ?? err));
  } finally {
    await page.close().catch(() => {});
    browserPool.release(entry);
  }
}

async function loginPje(page: any, creds: TJRJCredentials) {
  await page.goto(selectors.login.url, { waitUntil: "domcontentloaded", timeout: 45_000 });

  // Captcha já na tela de login → não temos como resolver.
  const loginHtml = await page.content();
  if (isCaptcha(loginHtml)) {
    throw new TJRJScrapeError("captcha_required", "captcha exigido na tela de login PJe TJRJ");
  }

  // Tab OAB
  const oabTab = page.locator(selectors.login.tabOAB).first();
  if (await oabTab.count()) await oabTab.click().catch(() => {});

  await page.fill(selectors.login.user, `${creds.oab_uf}${creds.oab_number}`).catch(async () => {
    await page.fill(selectors.login.user, creds.oab_number);
  });
  await page.fill(selectors.login.password, creds.password);

  await Promise.all([
    page.waitForLoadState("domcontentloaded", { timeout: 30_000 }),
    page.click(selectors.login.submit),
  ]);

  // Captcha pós-submit (PJe às vezes só pede captcha após N tentativas).
  const postHtml = await page.content();
  if (isCaptcha(postHtml)) {
    throw new TJRJScrapeError("captcha_required", "captcha exigido após submit do login");
  }

  // Mensagem explícita de erro nas caixas conhecidas.
  const errorBox = page.locator(selectors.login.errorBox).first();
  if (await errorBox.count()) {
    const txt = ((await errorBox.textContent().catch(() => "")) || "").trim();
    if (txt && looksLikeAuthFailure(txt)) {
      throw new TJRJScrapeError("auth_failed", `login PJe falhou: ${txt.slice(0, 160)}`);
    }
  }

  // Heurística de fallback no HTML inteiro (PJe pode renderizar fora dos seletores).
  if (looksLikeAuthFailure(postHtml)) {
    throw new TJRJScrapeError("auth_failed", "credenciais OAB rejeitadas pelo PJe TJRJ");
  }

  // Se ainda está em /login.seam após submit, considera falha de credencial.
  if (page.url().includes("login.seam")) {
    throw new TJRJScrapeError("auth_failed", "permaneceu em /login.seam após submit (credenciais provavelmente inválidas)");
  }
}

async function persistRaw(processNumber: string, raw: TJRJRaw) {
  try {
    const d = new Date();
    const dir = path.join(
      RAW_PATH,
      "tjrj",
      String(d.getUTCFullYear()),
      String(d.getUTCMonth() + 1).padStart(2, "0"),
      String(d.getUTCDate()).padStart(2, "0"),
    );
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, `${processNumber.replace(/\D/g, "")}-${Date.now()}.json`),
      JSON.stringify(raw, null, 2),
    );
  } catch {
    // disco cheio / read-only → não derruba o job
  }
}
