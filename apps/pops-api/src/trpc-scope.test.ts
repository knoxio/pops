/**
 * Integration coverage for the `protectedProcedure` scope-enforcement
 * middleware defined in `trpc.ts`.
 *
 * The pure `hasScopeFor` logic is covered in
 * `packages/core-db/src/__tests__/service-accounts.test.ts`. This file
 * exercises the wiring above it — that a service-account caller is
 * gated by `hasScopeFor(ctx.serviceAccount.scopes, path)` before any
 * downstream pops-api router runs, and that an unauthenticated caller
 * is rejected outright.
 *
 * Previously colocated with the legacy `core.serviceAccounts.*` admin
 * router tests. That router moved to `pops-core-api` (#2889, #2897) and
 * was deleted from pops-api in Track M1 PR 3, so the scope tests now
 * live next to the middleware they cover.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createCaller, createServiceAccountCaller, setupTestContext } from './shared/test-utils.js';

const ctx = setupTestContext();

beforeEach(() => {
  ctx.setup();
});

afterEach(() => {
  ctx.teardown();
});

describe('protectedProcedure scope enforcement', () => {
  it('lets a service account through when the path is in scope', async () => {
    const sa = createServiceAccountCaller({
      name: 'moltbot',
      scopes: ['core.settings'],
    });
    const result = await sa.core.settings.list({});
    expect(result.data).toEqual([]);
  });

  it('rejects a service account when the path is out of scope', async () => {
    const sa = createServiceAccountCaller({
      name: 'moltbot',
      scopes: ['cerebrum.query'],
    });
    await expect(sa.core.settings.list({})).rejects.toThrow(
      /not authorised for 'core\.settings\.list'/
    );
  });

  it('rejects entirely when neither user nor service account is present', async () => {
    const anon = createCaller(false);
    await expect(anon.core.settings.list({})).rejects.toThrow(/Missing or invalid credentials/);
  });
});
