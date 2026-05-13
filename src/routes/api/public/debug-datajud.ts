import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/debug-datajud")({
  server: {
    handlers: {
      GET: async () => {
        const apiKey = process.env.DATAJUD_API_KEY;
        if (!apiKey) {
          return new Response(
            JSON.stringify({ error: "DATAJUD_API_KEY not set" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }

        const res = await fetch(
          "https://api-publica.datajud.cnj.jus.br/api_publica_tjrj/_search",
          {
            method: "POST",
            headers: {
              Authorization: `APIKey ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ size: 1, query: { match_all: {} } }),
          },
        );

        const datajud_status = res.status;
        let raw: any = null;
        try {
          raw = await res.json();
        } catch {
          raw = { parse_error: true, text: await res.text().catch(() => "") };
        }

        const firstHit = raw?.hits?.hits?.[0]?._source ?? null;

        const body = {
          datajud_status,
          total_processos_tjrj: raw?.hits?.total?.value ?? null,
          campos_disponiveis: firstHit ? Object.keys(firstHit) : null,
          partes: firstHit?.partes ?? null,
          polos: firstHit?.polos ?? null,
          representantes: firstHit?.representantes ?? null,
          processo_numero: firstHit?.numeroProcesso ?? null,
          source_completo: firstHit,
          error_body: !res.ok ? raw : undefined,
        };

        return new Response(JSON.stringify(body, null, 2), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
