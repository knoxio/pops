/**
 * Smoke test for the lists-api `GET /openapi` route.
 *
 * The route serves the committed `openapi/lists.openapi.json` projection
 * verbatim so the pillar SDK can build its operationId route map against the
 * live pillar. This asserts the document is reachable, is OpenAPI 3.x, and
 * carries a known operationId (`items.search`).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openListsDb, type OpenedListsDb } from '../../db/index.js';
import { createListsApiApp } from '../app.js';

let tmpDir: string;
let listsDb: OpenedListsDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'lists-api-openapi-test-'));
  listsDb = openListsDb(join(tmpDir, 'lists.db'));
});

afterEach(() => {
  listsDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

type OpenApiBody = {
  openapi?: unknown;
  paths?: Record<string, Record<string, { operationId?: unknown }> | undefined>;
};

describe('GET /openapi', () => {
  it('serves the committed projection as JSON (3.x + items.search operationId)', async () => {
    const app = createListsApiApp({
      listsDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3006',
    });

    const res = await request(app).get('/openapi');

    expect(res.status).toBe(200);
    const body = res.body as OpenApiBody;
    expect(body.openapi).toMatch(/^3\./);

    const operationIds = Object.values(body.paths ?? {})
      .filter((item): item is Record<string, { operationId?: unknown }> => item !== undefined)
      .flatMap((item) => Object.values(item))
      .map((operation) => operation.operationId);
    expect(operationIds).toContain('items.search');
  });
});
