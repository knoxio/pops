/**
 * MSW (Mock Service Worker) setup for Vitest integration tests.
 *
 * Opt-in per test file — import the server and manage lifecycle yourself:
 *
 *   import { server } from "../test/msw-setup.js";
 *   import { http, HttpResponse } from "msw";
 *   import { afterAll, afterEach, beforeAll } from "vitest";
 *
 *   beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
 *   afterEach(() => server.resetHandlers());
 *   afterAll(() => server.close());
 *
 *   // Add handlers per test:
 *   server.use(
 *     http.get("https://api.example.com/data", () => {
 *       return HttpResponse.json({ mock: true });
 *     }),
 *   );
 */
import { type RequestHandler } from "msw";
import { setupServer } from "msw/node";

/** Default handlers — add shared mock endpoints here */
const handlers: RequestHandler[] = [];

/** MSW server instance — start/stop in your test's beforeAll/afterAll */
export const server = setupServer(...handlers);
