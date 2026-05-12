import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

/**
 * Global client-side middleware for every createServerFn call.
 * Pulls the current Supabase session from the browser client and forwards
 * the access_token as a Bearer Authorization header so requireSupabaseAuth
 * (server) can authenticate the request.
 *
 * Runs only in the browser; during SSR there is no window/localStorage so
 * we no-op and let the server middleware decide whether auth is required.
 */
export const supabaseAuthClientMiddleware = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    if (typeof window === "undefined") {
      return next();
    }
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) {
        // eslint-disable-next-line no-console
        console.log("[clientFnMw] attaching bearer token");
        return next({ headers: { Authorization: `Bearer ${token}` } });
      }
      // eslint-disable-next-line no-console
      console.warn("[clientFnMw] no active session");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[clientFnMw] getSession failed", err);
    }
    return next();
  },
);
