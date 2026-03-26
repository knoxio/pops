/**
 * MSW (Mock Service Worker) server for Node.js test environments.
 *
 * Usage in tests:
 *   import { mswServer } from "../shared/msw-server.js";
 *   import { http, HttpResponse } from "msw";
 *
 *   // Add per-test handlers:
 *   mswServer.use(
 *     http.get("https://api.example.com/data", () =>
 *       HttpResponse.json({ ok: true })
 *     )
 *   );
 *
 * The server is started/stopped via vitest setup (see vitest-msw-setup.ts).
 * Handlers are reset after each test automatically.
 */
import { setupServer } from "msw/node";

/** Shared MSW server instance — handlers added per-test via server.use() */
export const mswServer = setupServer();
