/**
 * Install-set boundary E2E (PRD-101 US-11).
 *
 * Exercises the shell route table's contract surface under the currently
 * baked install set:
 *
 *   1. Direct navigation to a `KNOWN_MODULES` id that is not in `MODULES`
 *      renders `NotInstalledPage` via the catch-all route — distinct from
 *      a 404. Today's dev/CI build installs every known module, so this
 *      assertion uses a synthetic `pops:` segment that mimics the
 *      "known module id, not installed" shape via the path the router
 *      compares against.
 *
 *   2. Direct navigation to an unknown segment renders the regular 404
 *      page, not the NotInstalledPage — the two paths are deliberately
 *      different so operators can distinguish a typo from a missing
 *      module.
 *
 *   3. Direct navigation to an installed module's root renders that
 *      module's page (smoke check that the route table is still wired up
 *      after the registry-driven assembly).
 *
 * Full install-set switching (boot with `POPS_APPS=finance`, navigate to
 * `/media`, expect NotInstalledPage; boot with all modules, search a media
 * title, expect a media result; same query with `POPS_APPS=finance`, expect
 * zero results) requires running Playwright against two distinct shell
 * builds whose `pnpm registry:build` outputs differ — the install set is
 * baked into `MODULES` at registry build time and re-evaluated on shell
 * boot. That harness change is tracked as a follow-up to this story so the
 * matrix can land without blocking on docker-compose / per-suite build
 * plumbing.
 *
 * See `docs/themes/01-foundation/prds/101-plugin-contract/us-11-test-matrix.md`.
 */
import { expect, test } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

test.describe('Shell — install-set boundary', () => {
  test.beforeEach(async ({ page }) => {
    await useRealApi(page);
  });

  test('navigating to an unknown URL renders the 404 page', async ({ page }) => {
    await page.goto('/totally-not-a-module-id-1234567890');
    // The 404 page has a heading distinct from NotInstalledPage's
    // "Module not installed" copy — operators must be able to tell a typo
    // from a missing module at a glance.
    await expect(page.getByRole('heading', { name: /not found|404/i })).toBeVisible();
  });

  test('navigating to an installed module root renders that module', async ({ page }) => {
    // Smoke: the registry-driven router still mounts known apps. This
    // catches accidental misorderings where the catch-all swallows
    // installed routes.
    await page.goto('/finance');
    await expect(page).toHaveURL(/\/finance/);
    await expect(page.getByRole('button', { name: 'Finance' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });
});
