/**
 * Smoke test for the inventory-api `GET /openapi` route.
 *
 * The route serves the committed `openapi/inventory.openapi.json` projection
 * verbatim so the pillar SDK can build its operationId route map against the
 * live pillar. This asserts the document is reachable, is OpenAPI 3.x, and
 * carries a known operationId (`connections.disconnect`) from the migrated
 * surface.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openInventoryDb, type OpenedInventoryDb } from '../../db/index.js';
import { createInventoryApiApp } from '../app.js';

let tmpDir: string;
let inventoryDb: OpenedInventoryDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'inventory-api-openapi-test-'));
  inventoryDb = openInventoryDb(join(tmpDir, 'inventory.db'));
});

afterEach(() => {
  inventoryDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

type OpenApiBody = {
  openapi?: unknown;
  paths?: Record<string, Record<string, { operationId?: unknown }> | undefined>;
};

describe('GET /openapi', () => {
  it('serves the committed projection as JSON (3.x + connections.disconnect operationId)', async () => {
    const app = createInventoryApiApp({
      inventoryDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3002',
    });

    const res = await request(app).get('/openapi');

    expect(res.status).toBe(200);
    const body = res.body as OpenApiBody;
    expect(body.openapi).toMatch(/^3\./);

    const operationIds = Object.values(body.paths ?? {})
      .filter((item): item is Record<string, { operationId?: unknown }> => item !== undefined)
      .flatMap((item) => Object.values(item))
      .map((operation) => operation.operationId);
    expect(operationIds).toContain('connections.disconnect');
  });
});
