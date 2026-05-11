/**
 * TJSPAdapter (e-SAJ) — exemplo de scraping resiliente.
 * Usa selectors versionados em ./selectors.json (sem hardcode).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { browserPool, checkRobots } from "../../browser-pool.js";
import selectors from "./selectors.json" with { type: "json" };

const ESAJ_BASE = "https://esaj.tjsp.jus.br/cpopg/open.do";
const RAW_PATH = process.env.RAW_PAYLOAD_LOCAL_PATH ?? "/var/lib/jusradar/raw";

export type TJSPRaw = {
  processNumber: string;
  className: string | null;
  partes: Array<{ name: string; polo: string }>;
  movimentos: Array<{ text: string; occurredAt: string }>;
};

export class TJSPScrapeError extends Error {
  constructor(public kind: "blocked" | "not_found" | "parse_failed" | "timeout" | "source_unavailable", msg: string) {
    super(msg);
  }
}

function isBlockedTitle(title: string): boolean {
  const t = title.toLowerCase();
  return (selectors.blocked.titlePatterns as string[]).some((p) => t.includes(p));
}

export async function scrapeTJSP(processNumber: string): Promise<TJSPRaw> {
  const allowed = await checkRobots(ESAJ_BASE);
  if (!allowed) throw new TJSPScrapeError("blocked", "robots.txt disallow");

  const entry = await browserPool.acquire("esaj.tjsp.jus.br");
  const page = await entry.context.newPage();
  try {
    await page.goto(ESAJ_BASE, { waitUntil: "domcontentloaded", timeout: 30_000 });
    if (isBlockedTitle(await page.title())) throw new TJSPScrapeError("blocked", "block page detected");

    await page.fill(selectors.form.input, processNumber);
    await Promise.all([
      page.waitForLoadState("domcontentloaded"),
      page.click(selectors.form.submit),
    ]);

    if (isBlockedTitle(await page.title())) throw new TJSPScrapeError("blocked", "block after submit");
    if ((await page.content()).toLowerCase().includes("não foi possível encontrar")) {
      throw new TJSPScrapeError("not_found", "process not found");
    }

    const className = await page.locator(selectors.process.classe).textContent().catch(() => null);

    const partes = await page.$$eval(`${selectors.process.partesTable} tr`, (rows) =>
      rows
        .map((r) => {
          const polo = r.querySelector("td.label, .tipoDeParticipacao")?.textContent?.trim() ?? "";
          const name = r.querySelector("td:nth-child(2)")?.textContent?.trim() ?? "";
          return { polo, name };
        })
        .filter((p) => p.name),
    );

    const movimentos = await page.$$eval(`${selectors.process.movimentacoesTable} tr`, (rows) =>
      rows
        .map((r) => {
          const date = r.querySelector(".dataMovimentacao")?.textContent?.trim() ?? "";
          const text = r.querySelector(".descricaoMovimentacao")?.textContent?.trim() ?? "";
          return { occurredAt: date, text };
        })
        .filter((m) => m.text),
    );

    const raw: TJSPRaw = {
      processNumber,
      className: className?.trim() ?? null,
      partes,
      movimentos,
    };

    // Persiste bruto local
    await persistRaw(processNumber, raw);
    return raw;
  } catch (err) {
    if (err instanceof TJSPScrapeError) throw err;
    throw new TJSPScrapeError("source_unavailable", String((err as Error).message ?? err));
  } finally {
    await page.close();
    browserPool.release(entry);
  }
}

async function persistRaw(processNumber: string, raw: TJSPRaw) {
  const d = new Date();
  const dir = path.join(
    RAW_PATH,
    String(d.getUTCFullYear()),
    String(d.getUTCMonth() + 1).padStart(2, "0"),
    String(d.getUTCDate()).padStart(2, "0"),
  );
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${processNumber.replace(/\D/g, "")}-${d.getTime()}.json`);
  await fs.writeFile(file, JSON.stringify(raw, null, 2), "utf8");
}
