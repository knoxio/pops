/**
 * HTTP integration tests for the /env REST routes.
 *
 * Uses supertest + createApp() so the full Express middleware stack is exercised
 * (body parsing, env router, env context middleware, etc.).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import BetterSqlite3 from "better-sqlite3";
import request from "supertest";
import { setDb, closeDb } from "../../../db.js";
import { initializeSchema } from "../../../db/schema.js";
import { listEnvs, closeEnvDb } from "./registry.js";
import { createApp } from "../../../app.js";

let tmpDir: string;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  tmpDir = join(tmpdir(), `pops-router-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
  process.env["SQLITE_PATH"] = join(tmpDir, "pops.db");

  // Set up a fresh prod DB for each test
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
// POST /env/:name — create environment
// ---------------------------------------------------------------------------

describe("POST /env/:name", () => {
  it("returns 201 with the created env record", async () => {
    const res = await request(app).post("/env/new-env").send({ seed: "none" });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("new-env");
    expect(res.body.seedType).toBe("none");
    expect(res.body.ttlSeconds).toBeNull();
    expect(res.body.ttlRemaining).toBeNull();
    expect(res.body.expiresAt).toBeNull();
    expect(res.body.createdAt).toBeDefined();
  });

  it("returns 201 with a seeded env", async () => {
    const res = await request(app).post("/env/seeded").send({ seed: "test" });

    expect(res.status).toBe(201);
    expect(res.body.seedType).toBe("test");
  });

  it("returns 201 with TTL", async () => {
    const res = await request(app).post("/env/ttl-env").send({ ttl: 3600 });

    expect(res.status).toBe(201);
    expect(res.body.ttlSeconds).toBe(3600);
    expect(res.body.ttlRemaining).toBeGreaterThan(0);
    expect(res.body.expiresAt).not.toBeNull();
  });

  it("defaults to seedType='none' when no body is sent", async () => {
    const res = await request(app).post("/env/no-body");

    expect(res.status).toBe(201);
    expect(res.body.seedType).toBe("none");
  });

  it("ignores zero and negative TTL values (treats as infinite)", async () => {
    const zeroRes = await request(app).post("/env/zero-ttl").send({ ttl: 0 });
    expect(zeroRes.status).toBe(201);
    expect(zeroRes.body.ttlSeconds).toBeNull();

    const negRes = await request(app).post("/env/neg-ttl").send({ ttl: -100 });
    expect(negRes.status).toBe(201);
    expect(negRes.body.ttlSeconds).toBeNull();
  });

  it("returns 409 when the env already exists", async () => {
    await request(app).post("/env/duplicate");
    const res = await request(app).post("/env/duplicate");

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });

  it("returns 400 for the reserved name 'prod'", async () => {
    const res = await request(app).post("/env/prod");

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/reserved/i);
  });

  it("returns 400 for names with invalid characters", async () => {
    const res = await request(app).post("/env/bad_name");

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("returns 400 for names longer than 64 chars", async () => {
    const res = await request(app).post(`/env/${"x".repeat(65)}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// GET /env — list all environments
// ---------------------------------------------------------------------------

describe("GET /env", () => {
  it("returns 200 with an empty array when no envs exist", async () => {
    const res = await request(app).get("/env");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns all created environments", async () => {
    await request(app).post("/env/list-a");
    await request(app).post("/env/list-b");

    const res = await request(app).get("/env");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    const names = res.body.map((e: { name: string }) => e.name);
    expect(names).toContain("list-a");
    expect(names).toContain("list-b");
  });

  it("each env record has the expected shape", async () => {
    await request(app).post("/env/shaped").send({ seed: "none", ttl: 60 });

    const res = await request(app).get("/env");
    const env = res.body[0];
    expect(env).toHaveProperty("name");
    expect(env).toHaveProperty("seedType");
    expect(env).toHaveProperty("ttlSeconds");
    expect(env).toHaveProperty("ttlRemaining");
    expect(env).toHaveProperty("createdAt");
    expect(env).toHaveProperty("expiresAt");
  });
});

// ---------------------------------------------------------------------------
// GET /env/:name — get individual environment
// ---------------------------------------------------------------------------

describe("GET /env/:name", () => {
  it("returns 200 with env record for an existing env", async () => {
    await request(app).post("/env/get-test");
    const res = await request(app).get("/env/get-test");

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("get-test");
  });

  it("includes ttlRemaining as null for infinite envs", async () => {
    await request(app).post("/env/infinite-get");
    const res = await request(app).get("/env/infinite-get");

    expect(res.status).toBe(200);
    expect(res.body.ttlRemaining).toBeNull();
  });

  it("includes a positive ttlRemaining for envs with TTL", async () => {
    await request(app).post("/env/ttl-get").send({ ttl: 3600 });
    const res = await request(app).get("/env/ttl-get");

    expect(res.status).toBe(200);
    expect(res.body.ttlRemaining).toBeGreaterThan(0);
  });

  it("returns 410 for a non-existent env", async () => {
    const res = await request(app).get("/env/ghost");

    expect(res.status).toBe(410);
    expect(res.body.error).toMatch(/not found|expired/i);
  });
});

// ---------------------------------------------------------------------------
// PATCH /env/:name — update TTL
// ---------------------------------------------------------------------------

describe("PATCH /env/:name", () => {
  it("returns 200 and updates the TTL", async () => {
    await request(app).post("/env/patch-test");
    const res = await request(app).patch("/env/patch-test").send({ ttl: 7200 });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("patch-test");
    expect(res.body.ttlSeconds).toBe(7200);
    expect(res.body.expiresAt).not.toBeNull();
  });

  it("clears the TTL when body has no valid ttl field", async () => {
    await request(app).post("/env/clear-ttl").send({ ttl: 3600 });
    const res = await request(app).patch("/env/clear-ttl").send({});

    expect(res.status).toBe(200);
    expect(res.body.ttlSeconds).toBeNull();
    expect(res.body.expiresAt).toBeNull();
  });

  it("returns 410 for a non-existent env", async () => {
    const res = await request(app).patch("/env/phantom").send({ ttl: 60 });

    expect(res.status).toBe(410);
    expect(res.body.error).toMatch(/not found|expired/i);
  });
});

// ---------------------------------------------------------------------------
// DELETE /env/:name — delete environment
// ---------------------------------------------------------------------------

describe("DELETE /env/:name", () => {
  it("returns 204 when the env is deleted", async () => {
    await request(app).post("/env/del-test");
    const res = await request(app).delete("/env/del-test");

    expect(res.status).toBe(204);
    expect(res.text).toBe("");
  });

  it("env is no longer accessible after deletion", async () => {
    await request(app).post("/env/del-gone");
    await request(app).delete("/env/del-gone");

    const res = await request(app).get("/env/del-gone");
    expect(res.status).toBe(410);
  });

  it("returns 410 when the env does not exist", async () => {
    const res = await request(app).delete("/env/nothing");

    expect(res.status).toBe(410);
    expect(res.body.error).toMatch(/not found|expired/i);
  });
});
