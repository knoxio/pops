/**
 * Integration tests for the `shell.*` REST surface, driven through the real
 * Express app via supertest.
 *
 * The manifest reflects the `POPS_APPS` / `POPS_OVERLAYS` install set,
 * defaulting to the full known set when unrestricted. Auth gating is
 * intentionally NOT asserted: REST runs under docker-net trust (non-identity
 * domain), so there is no `ctx.user` to bounce on.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCoreDb, type OpenedCoreDb } from '../../db/index.js';
import { createCoreApiApp } from '../app.js';
import { __resetInstalledModulesCache, KNOWN_APPS, KNOWN_OVERLAYS } from '../env-modules.js';
import { makeClient } from './test-utils.js';

const APP_KEY = 'POPS_APPS';
const OVERLAY_KEY = 'POPS_OVERLAYS';

let tmpDir: string;
let coreDb: OpenedCoreDb;
let originalApps: string | undefined;
let originalOverlays: string | undefined;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-api-shell-rest-test-'));
  coreDb = openCoreDb(join(tmpDir, 'core.db'));
  originalApps = process.env[APP_KEY];
  originalOverlays = process.env[OVERLAY_KEY];
  delete process.env[APP_KEY];
  delete process.env[OVERLAY_KEY];
  __resetInstalledModulesCache();
});

afterEach(() => {
  coreDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  if (originalApps === undefined) delete process.env[APP_KEY];
  else process.env[APP_KEY] = originalApps;
  if (originalOverlays === undefined) delete process.env[OVERLAY_KEY];
  else process.env[OVERLAY_KEY] = originalOverlays;
  __resetInstalledModulesCache();
});

function client() {
  return makeClient(
    createCoreApiApp({ coreDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3001' })
  );
}

describe('shell — manifest', () => {
  it('returns all known modules when no env restriction is set', async () => {
    const res = await client().shell.manifest();
    expect(res.apps).toEqual([...KNOWN_APPS]);
    expect(res.overlays).toEqual([...KNOWN_OVERLAYS]);
  });

  it('mirrors a restricted POPS_APPS install set', async () => {
    process.env[APP_KEY] = 'finance,inventory';
    process.env[OVERLAY_KEY] = '';
    __resetInstalledModulesCache();

    const res = await client().shell.manifest();
    expect(res.apps).toEqual(['finance', 'inventory']);
    expect(res.overlays).toEqual([...KNOWN_OVERLAYS]);
  });
});
