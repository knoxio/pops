/**
 * PRD-100 module-gate behaviour: a tRPC middleware in `trpc.ts` rejects
 * procedure calls whose top-level router is not present in
 * `POPS_APPS`/`POPS_OVERLAYS` with a NOT_FOUND error.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { appRouter } from '../router.js';
import { __resetInstalledModulesCache } from './env-modules.js';

const APP_KEY = 'POPS_APPS';
const OVERLAY_KEY = 'POPS_OVERLAYS';

function makeCaller() {
  return appRouter.createCaller({ user: { email: 'test@example.com' } });
}

describe('PRD-100 module gate (tRPC)', () => {
  let originalApps: string | undefined;
  let originalOverlays: string | undefined;

  beforeEach(() => {
    originalApps = process.env[APP_KEY];
    originalOverlays = process.env[OVERLAY_KEY];
    __resetInstalledModulesCache();
  });

  afterEach(() => {
    if (originalApps === undefined) delete process.env[APP_KEY];
    else process.env[APP_KEY] = originalApps;
    if (originalOverlays === undefined) delete process.env[OVERLAY_KEY];
    else process.env[OVERLAY_KEY] = originalOverlays;
    __resetInstalledModulesCache();
  });

  it('serves core.shell.manifest regardless of POPS_APPS', async () => {
    process.env[APP_KEY] = 'finance';
    const caller = makeCaller();
    const m = await caller.core.shell.manifest();
    expect(m.apps).toEqual(['finance']);
  });

  it('rejects calls to absent app modules with NOT_FOUND', async () => {
    process.env[APP_KEY] = 'finance';
    const caller = makeCaller();
    await expect(caller.media.movies.list({})).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: expect.stringContaining("'media' is not installed"),
    });
  });

  // Overlay gating uses the same `moduleGate` middleware as app gating.
  // With `ego` as the only known overlay today, you can't "exclude ego"
  // through `POPS_OVERLAYS` directly — empty/unset means "all", and any
  // non-empty value either lists `ego` or fails parse. The apps-rejection
  // test above exercises the shared gate code path; the env-modules tests
  // cover the parse layer (including the parsed-empty error case).

  it('default (env unset) installs everything', async () => {
    delete process.env[APP_KEY];
    delete process.env[OVERLAY_KEY];
    const caller = makeCaller();
    const m = await caller.core.shell.manifest();
    expect(m.apps).toContain('finance');
    expect(m.apps).toContain('media');
    expect(m.apps).toContain('inventory');
    expect(m.apps).toContain('cerebrum');
    expect(m.overlays).toContain('ego');
  });
});
