/**
 * Worker loop: pega jobs em status='needs_scraping', roda TJSPAdapter,
 * grava process_updates e atualiza processes.
 */
import { createClient } from "@supabase/supabase-js";
import { scrapeTJSP, TJSPScrapeError, type TJSPRaw } from "./adapters/tjsp/index.js";
import { browserPool } from "./browser-pool.js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TICK_MS = Number(process.env.TICK_INTERVAL_MS ?? 5000);
const WORKER_ID = process.env.WORKER_ID ?? `scraper-${process.pid}`;
const CONCURRENCY = Number(process.env.INGESTION_CONCURRENCY_SCRAPING ?? 2);

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function log(level: "info" | "warn" | "error", payload: Record<string, unknown>) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, worker: WORKER_ID, ...payload }));
}

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function parseBrDate(s: string): string {
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (!m) return new Date(0).toISOString();
  const [, d, mo, y, h = "00", mi = "00"] = m;
  return new Date(`${y}-${mo}-${d}T${h}:${mi}:00-03:00`).toISOString();
}

const PUBLIC_RX = /\b(estado|munic[ií]pio|uni[aã]o|fazenda|inss|defensoria|minist[eé]rio p[uú]blico)\b/i;

async function toCanonical(raw: TJSPRaw, tribunal: string) {
  const movements = await Promise.all(
    raw.movimentos.map(async (m, i) => {
      const occurredAt = parseBrDate(m.occurredAt);
      return {
        cnjMovementId: await sha256(`${occurredAt}|${m.text}|${i}`),
        occurredAt: occurredAt.replace("Z", "+00:00"),
        code: null,
        text: m.text,
      };
    }),
  );
  const sorted = [...movements].sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : 1));
  const hash = await sha256(JSON.stringify(sorted.map((m) => ({ id: m.cnjMovementId, at: m.occurredAt, code: m.code, text: m.text }))));

  return {
    processNumber: raw.processNumber,
    tribunalAlias: tribunal,
    classCode: null,
    className: raw.className,
    subjectCodes: [] as number[],
    parties: raw.partes.map((p) => {
      const name = p.name;
      return {
        name,
        nameNormalized: name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(),
        polo: /passivo|requerido/i.test(p.polo) ? "passivo" : /ativo|requerente/i.test(p.polo) ? "ativo" : "interessado",
        document: null,
        qualification: null,
        isPublicEntity: PUBLIC_RX.test(name),
      };
    }),
    movements: sorted,
    movementsHash: hash,
    fetchedAt: new Date().toISOString().replace("Z", "+00:00"),
    source: "tjsp_esaj" as const,
  };
}

async function processOne(job: any) {
  const start = Date.now();
  try {
    const raw = await scrapeTJSP(job.process_number);
    const canonical = await toCanonical(raw, job.tribunal);

    // upsert em processes
    const { data: existing } = await db
      .from("processes")
      .select("id, last_known_movements_hash")
      .eq("process_number", canonical.processNumber)
      .eq("tribunal_alias", canonical.tribunalAlias)
      .maybeSingle();

    let processId = existing?.id;
    if (!processId) {
      const { data: ins, error } = await db
        .from("processes")
        .insert({
          process_number: canonical.processNumber,
          tribunal_alias: canonical.tribunalAlias,
          last_known_movements_hash: canonical.movementsHash,
          last_synced_at: canonical.fetchedAt,
          last_source_used: "tjsp_esaj",
        })
        .select("id")
        .single();
      if (error) throw error;
      processId = ins.id;
    }

    if (existing?.last_known_movements_hash !== canonical.movementsHash) {
      await db.from("process_updates").insert({
        process_id: processId,
        process_number: canonical.processNumber,
        tribunal: canonical.tribunalAlias,
        source: "tjsp_esaj",
        canonical: JSON.parse(JSON.stringify(canonical)),
        movements_diff: JSON.parse(JSON.stringify(canonical.movements)),
        movements_hash: canonical.movementsHash,
      });
      await db
        .from("processes")
        .update({
          last_known_movements_hash: canonical.movementsHash,
          last_synced_at: canonical.fetchedAt,
          last_source_used: "tjsp_esaj",
        })
        .eq("id", processId);
    }

    await db.from("ingestion_jobs").update({ status: "done", locked_until: null }).eq("id", job.id);
    log("info", { event: "scrape_ok", jobId: job.id, durationMs: Date.now() - start });
  } catch (err) {
    const kind = err instanceof TJSPScrapeError ? err.kind : "unexpected";
    const status = job.attempts >= job.max_attempts ? "dead_letter" : "needs_scraping";
    await db
      .from("ingestion_jobs")
      .update({
        status,
        locked_until: null,
        scheduled_for: new Date(Date.now() + 60_000 * Math.pow(2, job.attempts)).toISOString(),
        last_error: String((err as Error).message ?? err).slice(0, 500),
        last_error_kind: kind,
      })
      .eq("id", job.id);
    log("warn", { event: "scrape_failed", jobId: job.id, kind, status });
  }
}

async function tick() {
  const { data: jobs, error } = await db.rpc("pick_ingestion_jobs", {
    _statuses: ["needs_scraping"],
    _worker: WORKER_ID,
    _lock_seconds: 300,
    _limit: CONCURRENCY,
  });
  if (error) {
    log("error", { event: "pick_failed", error: error.message });
    return;
  }
  if (!jobs?.length) return;
  await Promise.all(jobs.map(processOne));
}

async function main() {
  log("info", { event: "worker_started", concurrency: CONCURRENCY });
  process.on("SIGTERM", async () => {
    await browserPool.dispose();
    process.exit(0);
  });
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await tick();
    } catch (err) {
      log("error", { event: "tick_error", error: String(err) });
    }
    await new Promise((r) => setTimeout(r, TICK_MS));
  }
}

main().catch((err) => {
  log("error", { event: "fatal", error: String(err) });
  process.exit(1);
});
