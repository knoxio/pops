/**
 * Integration tests for the env context middleware.
 *
 * Verifies that:
 *  - Requests without ?env pass through to the prod DB.
 *  - Requests with ?env=prod pass through to the prod DB.
 *  - Requests with an unknown ?env return 410.
 *  - Requests with a valid ?env are routed to the named env DB via AsyncLocalStorage,
 *    so tRPC queries see the env's data instead of prod data.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import BetterSqlite3 from "better-sqlite3";
import request from "supertest";
import { setDb, closeDb } from "../db.js";
import { initializeSchema } from "../db/schema.js";
import { createEnv, closeEnvDb, listEnvs } from "../modules/core/envs/registry.js";
import { createApp } from "../app.js";

let tmpDir: string;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  tmpDir = join(tmpdir(), `pops-ctx-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
  process.env["SQLITE_PATH"] = join(tmpDir, "pops.db");

  const db = new BetterSqlite3(join(tmpDir, "pops.db"));
  initializeSchema(db);
  setDb(db);

  app = createApp();
});

afterEach(() => {
  for (const env of listEnvs()) {
    closeEnvDb(env.name);
  }
  closeDb();
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env["SQLITE_PATH"];
});

// ---------------------------------------------------------------------------
// Helper: make a tRPC transactions.list request
// tRPC batch GET format: /trpc/finance.transactions.list?batch=1&input={"0":{}}
// ---------------------------------------------------------------------------

async function listTransactions(envParam?: string) {
  const input = encodeURIComponent(JSON.stringify({ "0": {} }));
  let url = `/trpc/finance.transactions.list?batch=1&input=${input}`;
  if (envParam !== undefined) {
    url += `&env=${envParam}`;
  }
  return request(app).get(url);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("envContextMiddleware", () => {
  it("passes through to prod DB when no ?env param is set", async () => {
    // Prod DB is empty — should return 0 transactions
    const res = await listTransactions();
    expect(res.status).toBe(200);
    const total = res.body[0]!.result.data.pagination.total;
    expect(total).toBe(0);
  });

  it("passes through to prod DB when ?env=prod", async () => {
    const res = await listTransactions("prod");
    expect(res.status).toBe(200);
    const total = res.body[0]!.result.data.pagination.total;
    expect(total).toBe(0);
  });

  it("returns 410 for an unknown env name", async () => {
    const res = await listTransactions("does-not-exist");
    expect(res.status).toBe(410);
  });

  it("routes to the named env DB when ?env=NAME is valid", async () => {
    // Create an env seeded with test data (has 16 transactions)
    createEnv("ctx-test", "test", null);

    const envRes = await listTransactions("ctx-test");
    expect(envRes.status).toBe(200);
    const envTotal = envRes.body[0]!.result.data.pagination.total;
    expect(envTotal).toBeGreaterThan(0);

    // Prod DB is empty — no env param should return 0
    const prodRes = await listTransactions();
    expect(prodRes.status).toBe(200);
    const prodTotal = prodRes.body[0]!.result.data.pagination.total;
    expect(prodTotal).toBe(0);
  });

  it("env data is isolated: different envs return independent datasets", async () => {
    createEnv("env-a", "test", null);
    createEnv("env-b", "none", null);

    const resA = await listTransactions("env-a");
    const resB = await listTransactions("env-b");

    const totalA = resA.body[0]!.result.data.pagination.total;
    const totalB = resB.body[0]!.result.data.pagination.total;

    // env-a is seeded, env-b is empty
    expect(totalA).toBeGreaterThan(0);
    expect(totalB).toBe(0);
  });

  it("env data persists across multiple requests", async () => {
    createEnv("persistent", "test", null);

    const res1 = await listTransactions("persistent");
    const res2 = await listTransactions("persistent");

    expect(res1.body[0]!.result.data.pagination.total).toBe(
      res2.body[0]!.result.data.pagination.total
    );
  });

  it("returns 410 on tRPC request after the env is deleted", async () => {
    createEnv("deleted-env", "none", null);

    // Verify it works first
    const before = await listTransactions("deleted-env");
    expect(before.status).toBe(200);

    // Delete the env
    await request(app).delete("/env/deleted-env");

    const after = await listTransactions("deleted-env");
    expect(after.status).toBe(410);
  });

  it("does not affect the /env CRUD routes (they always use prod DB)", async () => {
    // Requesting the env list with ?env=e2e should still work
    // (the env router runs before env context middleware)
    createEnv("meta-test", "none", null);

    const res = await request(app).get("/env?env=meta-test");
    // Should list envs from prod DB (1 env), not error out
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });
});
