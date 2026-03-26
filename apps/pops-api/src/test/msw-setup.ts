/**
 * MSW (Mock Service Worker) setup for Vitest integration tests.
 *
 * Usage in tests:
 *   import { server } from "../test/msw-setup.js";
 *   import { http, HttpResponse } from "msw";
 *
 *   // Override a handler for a specific test:
 *   server.use(
 *     http.get("https://api.example.com/data", () => {
 *       return HttpResponse.json({ error: "not found" }, { status: 404 });
 *     }),
 *   );
 *
 * The server starts before all tests, resets handlers after each test,
 * and closes after all tests. Configured via vitest.config.ts setupFiles.
 */
import { type RequestHandler } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll } from "vitest";

/** Default handlers — add shared mock endpoints here */
const handlers: RequestHandler[] = [
  // Example:
  // http.get("https://api.themoviedb.org/3/*", () => {
  //   return HttpResponse.json({ results: [] });
  // }),
];

/** MSW server instance for tests */
export const server = setupServer(...handlers);

beforeAll(() => {
  server.listen({ onUnhandledRequest: "bypass" });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
