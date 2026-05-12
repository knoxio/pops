/**
 * Install-set switching E2E — finance-only build (PRD-101 US-11
 * follow-up, issue #2595).
 *
 * Boots the shell with `POPS_APPS=finance,core` (see the
 * `chromium-finance-only` project's webServer in `playwright.config.ts`)
 * and asserts the deferred acceptance criterion from
 * `docs/themes/01-foundation/prds/101-plugin-contract/us-11-test-matrix.md`:
 *
 *   Direct navigation to `/media` renders `NotInstalledPage` —
 *   distinct from the 404 page — because `media` is a buildable module
 *   the operator has excluded from this install set.
 *
 * The companion all-modules build (port 5567) keeps mounting `/media`
 * as usual; both servers run in the same `pnpm test:e2e` invocation,
 * proving the build-time `POPS_APPS` contract end-to-end.
 */
import { expect, test } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

test.describe('Shell — POPS_APPS=finance,core install set', () => {
  test.beforeEach(async ({ page }) => {
    await useRealApi(page);
  });

  test.afterEach(async ({ page }) => {
    // `useRealApi` registers a tRPC route handler that calls
    // `route.fetch()`. Background queries (e.g. cerebrum nudges) can still
    // be in flight when the test body returns, and any unhandled
    // route.fetch against a closed page surfaces as a test failure —
    // unrouteAll drains them before teardown.
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('navigating to /media renders NotInstalledPage, not 404', async ({ page }) => {
    await page.goto('/media');
    // NotInstalledPage exposes a "module not installed" heading; the 404
    // page exposes a "not found"/"404" heading. Asserting visibility on
    // one AND zero count on the other keeps the boundary explicit — a
    // regression that sends the user to either of the wrong pages
    // surfaces immediately.
    await expect(page.getByRole('heading', { name: /module not installed/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /not found|404/i })).toHaveCount(0);
  });

  test('navigating to /finance still mounts the installed module', async ({ page }) => {
    // Sanity check — proves the finance-only shell is not just broken;
    // installed modules continue to mount and the nav is healthy.
    await page.goto('/finance');
    await expect(page).toHaveURL(/\/finance/);
    await expect(page.getByRole('button', { name: 'Finance' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });
});
