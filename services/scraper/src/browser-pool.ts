/**
 * Pool de browsers Playwright reutilizáveis com throttle por domínio.
 */
import { chromium, type Browser, type BrowserContext } from "playwright";

const POOL_SIZE = Number(process.env.SCRAPING_BROWSER_POOL_SIZE ?? 3);
const THROTTLE_MS = Number(process.env.SCRAPING_DEFAULT_THROTTLE_MS ?? 1000);
const USER_AGENT =
  process.env.SCRAPING_USER_AGENT ?? "JusRadar/1.0 (+contato@jusradar.com.br)";
const MAX_PAGES = 100;

interface PoolEntry {
  browser: Browser;
  context: BrowserContext;
  pagesUsed: number;
  inUse: boolean;
  domain: string;
}

const lastHitByDomain = new Map<string, number>();
const robotsCache = new Map<string, { allowed: boolean; expires: number }>();

class BrowserPool {
  private entries: PoolEntry[] = [];

  async acquire(domain: string): Promise<PoolEntry> {
    // Throttle por domínio
    const last = lastHitByDomain.get(domain) ?? 0;
    const wait = Math.max(0, THROTTLE_MS - (Date.now() - last));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastHitByDomain.set(domain, Date.now());

    let entry = this.entries.find((e) => !e.inUse && e.domain === domain && e.pagesUsed < MAX_PAGES);
    if (!entry && this.entries.length < POOL_SIZE) {
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({ userAgent: USER_AGENT });
      entry = { browser, context, pagesUsed: 0, inUse: false, domain };
      this.entries.push(entry);
    }
    if (!entry) {
      // Espera um liberar
      await new Promise((r) => setTimeout(r, 250));
      return this.acquire(domain);
    }

    // Recicla contexto se atingiu limite
    if (entry.pagesUsed >= MAX_PAGES) {
      await entry.context.close();
      entry.context = await entry.browser.newContext({ userAgent: USER_AGENT });
      entry.pagesUsed = 0;
    }

    entry.inUse = true;
    return entry;
  }

  release(entry: PoolEntry) {
    entry.pagesUsed++;
    entry.inUse = false;
  }

  async dispose() {
    for (const e of this.entries) await e.browser.close();
    this.entries = [];
  }
}

export const browserPool = new BrowserPool();

export async function checkRobots(url: string): Promise<boolean> {
  const u = new URL(url);
  const key = `${u.protocol}//${u.host}`;
  const cached = robotsCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.allowed;

  try {
    const res = await fetch(`${key}/robots.txt`, {
      headers: { "User-Agent": USER_AGENT },
    });
    const txt = res.ok ? await res.text() : "";
    // Política conservadora: se mencionar disallow para o path, bloqueia
    const disallowed = txt
      .split(/\r?\n/)
      .some((line) => /^disallow:\s*\//i.test(line) && new RegExp(line.split(":")[1].trim()).test(u.pathname));
    const allowed = !disallowed;
    robotsCache.set(key, { allowed, expires: Date.now() + 24 * 3600 * 1000 });
    return allowed;
  } catch {
    return true; // sem robots → assume permitido
  }
}
