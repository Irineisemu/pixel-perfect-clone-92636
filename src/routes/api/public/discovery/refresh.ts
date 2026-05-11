/**
 * Endpoint chamado pelo pg_cron diário (06:00 UTC).
 * Auth: header `apikey` deve bater com SUPABASE_PUBLISHABLE_KEY.
 */
import { createFileRoute } from "@tanstack/react-router";
import { enqueueLawyerRefreshJobs } from "@/lib/lawyer.functions";

export const Route = createFileRoute("/api/public/discovery/refresh")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!expected || apikey !== expected) {
          return new Response("unauthorized", { status: 401 });
        }
        try {
          const r = await enqueueLawyerRefreshJobs();
          return Response.json({ ok: true, ...r });
        } catch (err) {
          console.error("[discovery refresh] error", err);
          return Response.json({ ok: false, error: String(err) }, { status: 500 });
        }
      },
    },
  },
});
