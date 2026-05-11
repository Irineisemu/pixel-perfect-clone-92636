/**
 * Endpoint público chamado pelo pg_cron a cada 1 minuto.
 * Auth: header `apikey` deve bater com SUPABASE_PUBLISHABLE_KEY.
 */
import { createFileRoute } from "@tanstack/react-router";
import { processDataJudJobs, enqueueSyncJobs } from "@/lib/ingestion.functions";

export const Route = createFileRoute("/api/public/ingestion/tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!expected || apikey !== expected) {
          return new Response("unauthorized", { status: 401 });
        }
        const url = new URL(request.url);
        const action = url.searchParams.get("action") ?? "process";

        try {
          if (action === "enqueue_targeted") {
            const r = await enqueueSyncJobs({ data: { mode: "targeted" } });
            return Response.json({ ok: true, action, ...r });
          }
          if (action === "enqueue_discovery") {
            const r = await enqueueSyncJobs({ data: { mode: "discovery" } });
            return Response.json({ ok: true, action, ...r });
          }
          const r = await processDataJudJobs({
            data: { limit: 10, workerId: "lovable-cron" },
          });
          return Response.json({ ok: true, action: "process", ...r });
        } catch (err) {
          console.error("[ingestion tick] error", err);
          return Response.json({ ok: false, error: String(err) }, { status: 500 });
        }
      },
    },
  },
});
