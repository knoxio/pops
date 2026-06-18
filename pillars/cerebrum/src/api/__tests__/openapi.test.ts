/**
 * Smoke test for the cerebrum-api `GET /openapi` route.
 *
 * The route serves the committed `openapi/cerebrum.openapi.json` projection
 * verbatim so the pillar SDK can build its operationId route map against the
 * live pillar. This asserts the document is reachable, is OpenAPI 3.x, and
 * carries a known operationId (`debrief.create`) from the migrated surface.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCerebrumDb, type OpenedCerebrumDb } from '../../db/index.js';
import { createCerebrumApiApp } from '../app.js';
import { makeEmptyPeerClients, makeReflexService, makeTemplateRegistry } from './test-utils.js';

let tmpDir: string;
let cerebrumDb: OpenedCerebrumDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-api-openapi-test-'));
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'));
});

afterEach(() => {
  cerebrumDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function makeApp(): ReturnType<typeof createCerebrumApiApp> {
  return createCerebrumApiApp({
    cerebrumDb,
    templateRegistry: makeTemplateRegistry(),
    reflexService: makeReflexService(cerebrumDb.db, join(tmpDir, 'reflexes.toml')),
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3007',
    peerClients: makeEmptyPeerClients(),
  });
}

type OpenApiBody = {
  openapi?: unknown;
  paths?: Record<string, Record<string, { operationId?: unknown }> | undefined>;
};

describe('GET /openapi', () => {
  it('serves the committed projection as JSON (3.x + debrief.create operationId)', async () => {
    const res = await request(makeApp()).get('/openapi');

    expect(res.status).toBe(200);
    const body = res.body as OpenApiBody;
    expect(body.openapi).toMatch(/^3\./);

    const operationIds = Object.values(body.paths ?? {})
      .filter((item): item is Record<string, { operationId?: unknown }> => item !== undefined)
      .flatMap((item) => Object.values(item))
      .map((operation) => operation.operationId);
    expect(operationIds).toContain('debrief.create');
  });
});
