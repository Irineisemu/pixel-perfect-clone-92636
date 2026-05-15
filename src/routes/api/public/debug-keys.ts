import { createFileRoute } from '@tanstack/react-router';

/**
 * TEMPORARY endpoint to retrieve secrets for worker deployment.
 * Protected by DEBUG_KEYS_PASSWORD. DELETE THIS FILE after copying the keys.
 *
 * Usage:
 *   curl -H "x-debug-password: SUA_SENHA" https://<your-app>.lovable.app/api/public/debug-keys
 */
export const Route = createFileRoute('/api/public/debug-keys')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const expected = process.env.DEBUG_KEYS_PASSWORD;
        if (!expected || expected.length < 8) {
          return new Response(
            JSON.stringify({ error: 'DEBUG_KEYS_PASSWORD not configured' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } },
          );
        }

        const provided = request.headers.get('x-debug-password');
        if (!provided || provided !== expected) {
          return new Response(
            JSON.stringify({ error: 'Unauthorized' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } },
          );
        }

        return new Response(
          JSON.stringify(
            {
              SUPABASE_URL: process.env.SUPABASE_URL ?? null,
              SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? null,
              CREDENTIALS_ENCRYPTION_KEY: process.env.CREDENTIALS_ENCRYPTION_KEY ?? null,
              warning: 'DELETE src/routes/api/public/debug-keys.ts after copying these values.',
            },
            null,
            2,
          ),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-store',
            },
          },
        );
      },
    },
  },
});
