/**
 * Paperless-ngx tRPC router — connection status and health check.
 */
import { router, protectedProcedure } from "../../../trpc.js";
import { getPaperlessClient } from "./index.js";

export const paperlessRouter = router({
  /** Check if Paperless-ngx is configured and reachable. */
  status: protectedProcedure.query(async () => {
    const client = getPaperlessClient();

    if (!client) {
      return { data: { configured: false, available: false } };
    }

    try {
      await client.getDocumentTypes();
      return { data: { configured: true, available: true } };
    } catch {
      return { data: { configured: true, available: false } };
    }
  }),
});
