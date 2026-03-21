/**
 * Paperless tRPC router — connection status for graceful degradation.
 */
import { router, protectedProcedure } from "../../../trpc.js";
import { getEnv } from "../../../env.js";

export const paperlessRouter = router({
  /** Check if Paperless-ngx is configured and reachable. */
  status: protectedProcedure.query(async () => {
    const url = getEnv("PAPERLESS_URL");
    const token = getEnv("PAPERLESS_TOKEN");
    if (!url || !token) {
      return { data: { configured: false, available: false } };
    }

    try {
      const baseUrl = url.replace(/\/+$/, "");
      const response = await fetch(`${baseUrl}/api/`, {
        headers: { Authorization: `Token ${token}` },
        signal: AbortSignal.timeout(3000),
      });
      return { data: { configured: true, available: response.ok } };
    } catch {
      return { data: { configured: true, available: false } };
    }
  }),
});
