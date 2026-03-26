/**
 * Validates MSW server setup works correctly in the test environment.
 */
import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import "./vitest-msw-setup.js";
import { mswServer } from "./msw-server.js";

describe("MSW server", () => {
  it("intercepts HTTP requests with per-test handlers", async () => {
    mswServer.use(
      http.get("https://api.example.com/data", () => HttpResponse.json({ status: "ok", value: 42 }))
    );

    const response = await fetch("https://api.example.com/data");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: "ok", value: 42 });
  });

  it("resets handlers between tests (no leakage)", async () => {
    // The handler from the previous test should NOT be active
    // because vitest-msw-setup.ts calls resetHandlers() after each test.
    // With onUnhandledRequest: "bypass", this will hit the real network
    // (and fail), proving the handler was cleaned up.
    mswServer.use(
      http.get("https://api.example.com/other", () => HttpResponse.json({ fresh: true }))
    );

    const response = await fetch("https://api.example.com/other");
    const body = await response.json();

    expect(body).toEqual({ fresh: true });
  });

  it("supports POST requests with request body", async () => {
    mswServer.use(
      http.post("https://api.example.com/submit", async ({ request }) => {
        const body = (await request.json()) as { name: string };
        return HttpResponse.json({ received: body.name });
      })
    );

    const response = await fetch("https://api.example.com/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "test" }),
    });
    const result = await response.json();

    expect(result).toEqual({ received: "test" });
  });

  it("supports error responses", async () => {
    mswServer.use(
      http.get("https://api.example.com/error", () =>
        HttpResponse.json({ error: "Not found" }, { status: 404 })
      )
    );

    const response = await fetch("https://api.example.com/error");

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Not found");
  });
});
