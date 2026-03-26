/**
 * MSW lifecycle helpers for tests that need HTTP mocking.
 *
 * Import this in individual test files that use MSW:
 *
 *   import "./vitest-msw-setup.js";
 *   import { mswServer } from "./msw-server.js";
 *   import { http, HttpResponse } from "msw";
 *
 * This starts the MSW server before all tests in the file,
 * resets handlers between tests, and closes on cleanup.
 *
 * NOT loaded globally — tests that mock fetch directly (e.g. vi.stubGlobal)
 * would conflict with MSW's fetch interception.
 */
import { afterAll, afterEach, beforeAll } from "vitest";
import { mswServer } from "./msw-server.js";

beforeAll(() => mswServer.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());
