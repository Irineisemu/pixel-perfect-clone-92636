/**
 * Worker loop: consome jobs `needs_scraping` e roteia por tribunal.
 * Suporta:
 *   - tjsp (e-SAJ) — público
 *   - tjrj (PJe)   — público (2º grau) ou autenticado (1º grau, com credenciais OAB)
 *   - kind=credential_check — apenas valida login da OAB
 */
import http from "node:http";
import { createClient } from "@supabase/supabase-js";
import { scrapeTJSP, TJSPScrapeError, type TJSPRaw } from "./adapters/tjsp/index.js";
import { scrapeTJRJ, TJRJScrapeError, type TJRJRaw, type TJRJCredentials } from "./adapters/tjrj/index.js";
import { browserPool } from "./browser-pool.js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CREDS_KEY = process.env.CREDENTIALS_ENCRYPTION_KEY ?? "";
const TICK_MS = Number(process.env.TICK_INTERVAL_MS ?? 5000);
const WORKER_ID = process.env.WORKER_ID ?? `scraper-${process.pid}`;
const CONCURRENCY = Number(process.env.INGESTION_CONCURRENCY_SCRAPING ?? 2);
const HEALTH_PORT = Number(process.env.HEALTH_PORT ?? 8080);

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

let lastTickAt = Date.now();
let lastSuccessAt = 0;

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

type AnyRaw = TJSPRaw | TJRJRaw;

async function toCanonical(raw: AnyRaw, tribunal: string, source: string) {
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
  const hash = await sha256(
    JSON.stringify(sorted.map((m) => ({ id: m.cnjMovementId, at: m.occurredAt, code: m.code, text: m.text }))),
  );

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
    source,
  };
}

async function fetchCredentialsFor(userId: string, tribunal: string): Promise<TJRJCredentials | null> {
  if (!CREDS_KEY) return null;
  const { data, error } = await db.rpc("get_tribunal_credential_for_scraper", {
    _user_id: userId,
    _tribunal: tribunal,
    _key: CREDS_KEY,
  });
  if (error) {
    log("warn", { event: "creds_fetch_failed", userId, tribunal, error: error.message });
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.password) return null;
  return { oab_number: row.oab_number, oab_uf: row.oab_uf, password: row.password };
}

async function findUserIdForJob(job: any): Promise<string | null> {
  if (job.payload?.user_id) return job.payload.user_id as string;
  const targetIds: string[] = job.target_ids ?? [];
  if (!targetIds.length) return null;
  const { data } = await db
    .from("monitoring_targets")
    .select("user_id")
    .in("id", targetIds)
    .limit(1)
    .maybeSingle();
  return data?.user_id ?? null;
}

async function processCredentialCheck(job: any) {
  const start = Date.now();
  const credentialId = job.payload?.credential_id as string | undefined;
  const tribunal = job.tribunal;
  const userId = await findUserIdForJob(job);
  if (!userId || !credentialId || !tribunal) {
    await db.from("ingestion_jobs").update({
      status: "dead_letter",
      locked_until: null,
      last_error: "credential_check sem user_id/credential_id/tribunal",
      last_error_kind: "invalid_payload",
    }).eq("id", job.id);
    return;
  }
  const creds = await fetchCredentialsFor(userId, tribunal);
  if (!creds) {
    await db.rpc("update_credential_validation", {
      _credential_id: credentialId,
      _status: "failed",
      _error: "credenciais não encontradas",
    });
    await db.from("ingestion_jobs").update({ status: "dead_letter", locked_until: null, last_error: "creds_not_found", last_error_kind: "missing_credentials" }).eq("id", job.id);
    return;
  }
  try {
    if (tribunal === "tjrj") {
      // Usa um número conhecido só pra validar login: 0000000-00.0000.0.00.0000 não funciona,
      // então tentamos um login "puro" via scrapeTJRJ com 1º grau dummy → vai cair em not_found
      // mas se o login funcionar passamos. Estratégia simples: força 1º grau.
      try {
        await scrapeTJRJ("0000001-00.2024.8.19.0001", creds);
      } catch (e) {
        if (e instanceof TJRJScrapeError && (e.kind === "not_found" || e.kind === "parse_failed")) {
          // login OK
        } else {
          throw e;
        }
      }
    } else {
      throw new Error(`credential_check não suportado para ${tribunal}`);
    }
    await db.rpc("update_credential_validation", { _credential_id: credentialId, _status: "ok", _error: null });
    await db.from("ingestion_jobs").update({ status: "done", locked_until: null }).eq("id", job.id);
    log("info", { event: "credential_check_ok", credentialId, durationMs: Date.now() - start });
  } catch (err) {
    const kind = err instanceof TJRJScrapeError ? err.kind : "unexpected";
    const msg = String((err as Error).message ?? err).slice(0, 500);
    await db.rpc("update_credential_validation", { _credential_id: credentialId, _status: "failed", _error: msg });
    await db.from("ingestion_jobs").update({
      status: "dead_letter",
      locked_until: null,
      last_error: msg,
      last_error_kind: kind,
    }).eq("id", job.id);
    log("warn", { event: "credential_check_failed", credentialId, kind, msg });
  }
}

async function processOne(job: any) {
  if (job.kind === "credential_check") {
    return processCredentialCheck(job);
  }

  const start = Date.now();
  const tribunal: string = job.tribunal;
  try {
    let raw: AnyRaw;
    let source: string;

    if (tribunal === "tjsp") {
      raw = await scrapeTJSP(job.process_number);
      source = "tjsp_esaj";
    } else if (tribunal === "tjrj") {
      const userId = await findUserIdForJob(job);
      const creds = userId ? await fetchCredentialsFor(userId, "tjrj") : null;
      raw = await scrapeTJRJ(job.process_number, creds);
      source = "tjrj_pje";
    } else {
      throw new Error(`tribunal não suportado: ${tribunal}`);
    }

    const canonical = await toCanonical(raw, tribunal, source);

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
          last_source_used: source,
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
        source,
        canonical: JSON.parse(JSON.stringify(canonical)),
        movements_diff: JSON.parse(JSON.stringify(canonical.movements)),
        movements_hash: canonical.movementsHash,
      });
      await db
        .from("processes")
        .update({
          last_known_movements_hash: canonical.movementsHash,
          last_synced_at: canonical.fetchedAt,
          last_source_used: source,
        })
        .eq("id", processId);
    }

    await db.from("ingestion_jobs").update({ status: "done", locked_until: null }).eq("id", job.id);
    lastSuccessAt = Date.now();
    log("info", { event: "scrape_ok", jobId: job.id, tribunal, durationMs: Date.now() - start });
  } catch (err) {
    const kind =
      err instanceof TJSPScrapeError || err instanceof TJRJScrapeError ? err.kind : "unexpected";
    const recoverable = kind !== "auth_required" && kind !== "not_found" && kind !== "captcha_required";
    const status =
      !recoverable || job.attempts >= job.max_attempts ? "dead_letter" : "needs_scraping";
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
    log("warn", { event: "scrape_failed", jobId: job.id, tribunal, kind, status, durationMs: Date.now() - start });
  }
}

async function tick() {
  lastTickAt = Date.now();
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

function startHealthServer() {
  const server = http.createServer((req, res) => {
    if (req.url === "/healthz") {
      const stale = Date.now() - lastTickAt > TICK_MS * 6;
      res.writeHead(stale ? 503 : 200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        ok: !stale,
        worker: WORKER_ID,
        lastTickAgoMs: Date.now() - lastTickAt,
        lastSuccessAgoMs: lastSuccessAt ? Date.now() - lastSuccessAt : null,
      }));
      return;
    }
    res.writeHead(404).end();
  });
  server.listen(HEALTH_PORT, () => log("info", { event: "health_server_listening", port: HEALTH_PORT }));
}

async function main() {
  if (!CREDS_KEY) log("warn", { event: "missing_creds_key", msg: "CREDENTIALS_ENCRYPTION_KEY não definida — credenciais não serão descriptografadas" });
  log("info", { event: "worker_started", concurrency: CONCURRENCY });
  startHealthServer();
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
