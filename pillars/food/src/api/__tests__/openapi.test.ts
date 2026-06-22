/**
 * Smoke test for the food-api `GET /openapi` route.
 *
 * The route serves the committed `openapi/food.openapi.json` projection
 * verbatim so the pillar SDK can build its operationId route map against the
 * live pillar. This asserts the document is reachable, is OpenAPI 3.x, carries
 * a known operationId from the migrated surface, and no longer carries the
 * dropped `ai.logInference` route (#3490).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openFoodDb, type OpenedFoodDb } from '../../db/index.js';
import { createFoodApiApp } from '../app.js';

let tmpDir: string;
let foodDb: OpenedFoodDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'food-api-openapi-test-'));
  foodDb = openFoodDb(join(tmpDir, 'food.db'));
});

afterEach(() => {
  foodDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

type OpenApiBody = {
  openapi?: unknown;
  paths?: Record<string, Record<string, { operationId?: unknown }> | undefined>;
};

describe('GET /openapi', () => {
  it('serves the committed projection as JSON (3.x; ai.logInference dropped)', async () => {
    const app = createFoodApiApp({
      foodDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3005',
    });

    const res = await request(app).get('/openapi');

    expect(res.status).toBe(200);
    const body = res.body as OpenApiBody;
    expect(body.openapi).toMatch(/^3\./);

    const operationIds = Object.values(body.paths ?? {})
      .filter((item): item is Record<string, { operationId?: unknown }> => item !== undefined)
      .flatMap((item) => Object.values(item))
      .map((operation) => operation.operationId);
    expect(operationIds).toContain('inbox.listRejected');
    expect(operationIds).not.toContain('ai.logInference');
  });
});
