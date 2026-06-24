/**
 * Smoke test for the finance-api `GET /openapi` route.
 *
 * The route serves the committed `openapi/finance.openapi.json` projection
 * verbatim so the pillar SDK can build its operationId route map against the
 * live pillar. This asserts the document is reachable, is OpenAPI 3.x, and
 * carries a known operationId (`budgets.list`).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openFinanceDb, type OpenedFinanceDb } from '../../db/index.js';
import { createFinanceApiApp } from '../app.js';
import { makeContactsFake } from './contacts-fake.js';

let tmpDir: string;
let financeDb: OpenedFinanceDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-openapi-test-'));
  financeDb = openFinanceDb(join(tmpDir, 'finance.db'));
});

afterEach(() => {
  financeDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

type OpenApiBody = {
  openapi?: unknown;
  paths?: Record<string, Record<string, { operationId?: unknown }> | undefined>;
};

describe('GET /openapi', () => {
  it('serves the committed projection as JSON (3.x + budgets.list operationId)', async () => {
    const app = createFinanceApiApp({
      financeDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3004',
      contacts: makeContactsFake(),
    });

    const res = await request(app).get('/openapi');

    expect(res.status).toBe(200);
    const body = res.body as OpenApiBody;
    expect(body.openapi).toMatch(/^3\./);

    const operationIds = Object.values(body.paths ?? {})
      .filter((item): item is Record<string, { operationId?: unknown }> => item !== undefined)
      .flatMap((item) => Object.values(item))
      .map((operation) => operation.operationId);
    expect(operationIds).toContain('budgets.list');
  });
});
