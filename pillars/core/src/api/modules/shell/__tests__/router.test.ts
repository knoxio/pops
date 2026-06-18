/**
 * Tests for the `core.shell.manifest` tRPC router in the core pillar.
 *
 * Exercises the wire seam over an in-memory core.db caller, asserting the
 * manifest mirrors the POPS_APPS / POPS_OVERLAYS install set and that the
 * procedure is auth-gated.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { TRPCError } from '@trpc/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCoreDb, type OpenedCoreDb } from '../../../../db/index.js';
import { __resetInstalledModulesCache, KNOWN_APPS, KNOWN_OVERLAYS } from '../../../env-modules.js';
import { appRouter } from '../../../router.js';
import { type Context } from '../../../trpc.js';

const APP_KEY = 'POPS_APPS';
const OVERLAY_KEY = 'POPS_OVERLAYS';

let tmpDir: string;
let coreDb: OpenedCoreDb;
let originalApps: string | undefined;
let originalOverlays: string | undefined;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-api-shell-test-'));
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

function userCaller(): ReturnType<typeof appRouter.createCaller> {
  const ctx: Context = {
    user: { email: 'admin@example.com' },
    serviceAccount: null,
    coreDb: coreDb.db,
  };
  return appRouter.createCaller(ctx);
}

function anonCaller(): ReturnType<typeof appRouter.createCaller> {
  const ctx: Context = { user: null, serviceAccount: null, coreDb: coreDb.db };
  return appRouter.createCaller(ctx);
}

describe('core.shell.manifest', () => {
  it('returns all known modules when no env restriction is set', async () => {
    const res = await userCaller().core.shell.manifest();
    expect(res.apps).toEqual([...KNOWN_APPS]);
    expect(res.overlays).toEqual([...KNOWN_OVERLAYS]);
  });

  it('mirrors a restricted POPS_APPS install set', async () => {
    process.env[APP_KEY] = 'finance,inventory';
    process.env[OVERLAY_KEY] = '';
    __resetInstalledModulesCache();

    const res = await userCaller().core.shell.manifest();
    expect(res.apps).toEqual(['finance', 'inventory']);
    expect(res.overlays).toEqual([...KNOWN_OVERLAYS]);
  });

  it('rejects an anonymous caller with UNAUTHORIZED', async () => {
    await expect(anonCaller().core.shell.manifest()).rejects.toBeInstanceOf(TRPCError);
    await expect(anonCaller().core.shell.manifest()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});
