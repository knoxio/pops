/**
 * Integration test — finance import: real entity matching against seeded DB (#2121).
 *
 * Tier 3: real API against an isolated seeded SQLite environment.
 *
 * Flow covered:
 *   Upload a CSV with 3 merchant descriptions and assert that the Review step
 *   classifies them according to the real entity-matching pipeline backed by
 *   the seeded `entities` table:
 *     - "WOOLWORTHS METRO 1234"      → Matched (Woolworths)
 *     - "NETFLIX SUBSCRIPTION"        → Matched (Netflix)
 *     - "TOTALLY UNKNOWN MERCHANT XYZ" → Uncertain
 *
 *   Then expand the Uncertain card's entity combobox and verify the real
 *   entities list (entities.list) populates it with at least the 3 seeded
 *   entities expected to exist (Woolworths, Coles, Netflix).
 *
 * Why this is Tier 3:
 *   - imports.processImport runs the real 5-stage matcher (alias → exact →
 *     prefix → contains → punctuation strip) against entities seeded by
 *     POST /env/<name> { seed: 'test' }.
 *   - "WOOLWORTHS METRO" is matched via the case-insensitive `Woolworths Metro`
 *     alias on the Woolworths seed entity.
 *   - "NETFLIX SUBSCRIPTION" is matched via the prefix stage (description
 *     starts with the entity name `Netflix`).
 *   - The unknown row falls through every stage and lands in Uncertain.
 *
 * Isolation:
 *   A dedicated env name (`e2e-entity-matching`) is used so this test does not
 *   share state with the shared `e2e` env consumed by other specs. The env is
 *   deleted + recreated in beforeAll so re-runs start from the same seeded
 *   state (the wizard never commits, but the API caches lookup tables per env
 *   so a clean slate keeps the assertions deterministic).
 *
 * Persistence:
 *   The test only walks the wizard up to Review and asserts on the in-memory
 *   processed output. It deliberately does NOT commit — the goal is to verify
 *   the matcher's classification, not to exercise commit semantics (#2122
 *   already covers that).
 */
import { expect, test, type Page, type APIRequestContext } from '@playwright/test';

const API_URL = process.env['FINANCE_API_URL'] ?? 'http://localhost:3000';
const ENV_NAME = 'e2e-entity-matching';

/**
 * Three-row CSV chosen to exercise all three classification outcomes:
 *   1. Alias match  — "WOOLWORTHS METRO" is a seeded alias on Woolworths.
 *   2. Prefix match — "NETFLIX SUBSCRIPTION" starts with the entity name.
 *   3. No match     — falls through to Uncertain.
 *
 * Distinct dates/amounts keep the rows from being de-duplicated against each
 * other or against any leftover seed transactions.
 */
const entityMatchingCsv = `Date,Description,Amount
10/02/2026,WOOLWORTHS METRO 1234,87.45
11/02/2026,NETFLIX SUBSCRIPTION,22.99
12/02/2026,TOTALLY UNKNOWN MERCHANT XYZ,50.00`;

const descriptors = {
  woolworths: 'WOOLWORTHS METRO 1234',
  netflix: 'NETFLIX SUBSCRIPTION',
  unknown: 'TOTALLY UNKNOWN MERCHANT XYZ',
} as const;

async function resetEnvironment(request: APIRequestContext): Promise<void> {
  // Delete any leftover env from a previous run (404 when absent — fine).
  await request.delete(`${API_URL}/env/${ENV_NAME}`);
  const res = await request.post(`${API_URL}/env/${ENV_NAME}`, {
    data: { seed: 'test', ttl: 3600 },
  });
  if (res.status() !== 201) {
    const body = await res.text();
    throw new Error(`Failed to create '${ENV_NAME}' env: ${res.status()} ${body}`);
  }
}

async function deleteEnvironment(request: APIRequestContext): Promise<void> {
  await request.delete(`${API_URL}/env/${ENV_NAME}`);
}

/** Route every tRPC call through the dedicated isolated env. */
async function routeAllTrpcToEnv(page: Page, envName: string): Promise<void> {
  await page.route('/trpc/**', async (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set('env', envName);
    const response = await route.fetch({ url: url.toString() });
    await route.fulfill({ response });
  });
}

async function uploadCsv(page: Page, content: string, fileName: string): Promise<void> {
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: fileName,
    mimeType: 'text/csv',
    buffer: Buffer.from(content),
  });
  await expect(page.getByText(fileName)).toBeVisible();
}

/** Walk Upload → Map Columns → wait for the Review heading. */
async function walkToReview(page: Page, content: string, fileName: string): Promise<void> {
  await uploadCsv(page, content, fileName);
  await page.getByRole('button', { name: /^next$/i }).click();

  await expect(page.getByRole('heading', { name: 'Map Columns' })).toBeVisible();
  await page.getByRole('button', { name: /^next$/i }).click();

  // Real backend processes in background. Named env context skips external
  // API calls, so processing stays well within 30s.
  await expect(page.getByRole('heading', { name: 'Review', exact: true })).toBeVisible({
    timeout: 30_000,
  });
}

test.describe('Finance import — real entity matching against seeded DB (#2121)', () => {
  let pageErrors: string[] = [];
  let consoleErrors: string[] = [];

  test.beforeAll(async ({ request }) => {
    await resetEnvironment(request);
  });

  test.afterAll(async ({ request }) => {
    await deleteEnvironment(request);
  });

  test.beforeEach(async ({ page }) => {
    pageErrors = [];
    consoleErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    await routeAllTrpcToEnv(page, ENV_NAME);
  });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    const realConsoleErrors = consoleErrors.filter(
      (e) =>
        !e.includes('React Router') &&
        !e.includes('Download the React DevTools') &&
        !e.includes('Failed to load resource')
    );
    expect(pageErrors).toHaveLength(0);
    expect(realConsoleErrors).toHaveLength(0);
  });

  test('classifies seeded merchants as Matched and unknown merchants as Uncertain', async ({
    page,
  }) => {
    await page.goto('/finance/import');
    await walkToReview(page, entityMatchingCsv, 'entity-matching.csv');

    const matchedTab = page.getByRole('tab', { name: /matched/i });
    const uncertainTab = page.getByRole('tab', { name: /uncertain/i });
    const failedTab = page.getByRole('tab', { name: /failed/i });

    // Tab counts reflect the real matcher's classification of the 3 rows.
    await expect(matchedTab).toHaveText(/matched.*\(2\)/i, { timeout: 10_000 });
    await expect(uncertainTab).toHaveText(/uncertain.*\(1\)/i);
    await expect(failedTab).toHaveText(/failed.*\(0\)/i);

    // -------------------------------------------------------------------------
    // Matched tab — Woolworths (alias) and Netflix (prefix) cards are visible
    // and labelled with the correct entity name.
    // -------------------------------------------------------------------------
    await matchedTab.click();
    const matchedPanel = page.getByRole('tabpanel', { name: /matched/i });

    const woolworthsCard = matchedPanel
      .locator('[data-testid="transaction-card"]')
      .filter({ hasText: descriptors.woolworths })
      .filter({ visible: true });
    const netflixCard = matchedPanel
      .locator('[data-testid="transaction-card"]')
      .filter({ hasText: descriptors.netflix })
      .filter({ visible: true });

    await expect(woolworthsCard).toHaveCount(1);
    await expect(netflixCard).toHaveCount(1);

    // The combobox button label inside the matched card displays the assigned
    // entity name (the matcher's chosen entityName surfaces through
    // EntityTriggerLabel).
    await expect(woolworthsCard.getByRole('combobox')).toContainText('Woolworths');
    await expect(netflixCard.getByRole('combobox')).toContainText('Netflix');

    // The unknown row must NOT appear in Matched.
    await expect(matchedPanel.getByText(descriptors.unknown)).toHaveCount(0);

    // -------------------------------------------------------------------------
    // Uncertain tab — unknown merchant is visible. Switch to List view so
    // every uncertain row's card (and its combobox) is rendered without the
    // grouped collapsing layer.
    // -------------------------------------------------------------------------
    await uncertainTab.click();
    const uncertainPanel = page.getByRole('tabpanel', { name: /uncertain/i });

    await uncertainPanel.getByRole('button', { name: 'List' }).click();
    const unknownCard = uncertainPanel
      .locator('[data-testid="transaction-card"]')
      .filter({ hasText: descriptors.unknown })
      .filter({ visible: true });
    await expect(unknownCard).toHaveCount(1);

    // The combobox should NOT yet have an assigned entity for the uncertain
    // row — its trigger shows the placeholder text.
    const unknownCombobox = unknownCard.getByRole('combobox');
    await expect(unknownCombobox).toContainText(/choose entity/i);

    // -------------------------------------------------------------------------
    // Open the entity combobox on the uncertain card and verify entities.list
    // populated the dropdown with the seeded entities.
    // -------------------------------------------------------------------------
    await unknownCombobox.click();

    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();

    const options = listbox.getByRole('option');
    // The seeder ships 10 entities, so the dropdown must offer at least 3.
    // We assert >= 3 (per the task spec) to keep the test resilient to seed
    // additions while still proving the list is real.
    await expect(options).toHaveCount(await options.count());
    expect(await options.count()).toBeGreaterThanOrEqual(3);

    // Spot-check that the seeded entities the matcher already keyed off are
    // present in the dropdown — this proves entities.list is hitting the same
    // env DB the matcher read from.
    await expect(listbox.getByRole('option', { name: /woolworths/i })).toHaveCount(1);
    await expect(listbox.getByRole('option', { name: /coles/i })).toHaveCount(1);
    await expect(listbox.getByRole('option', { name: /netflix/i })).toHaveCount(1);
  });
});
