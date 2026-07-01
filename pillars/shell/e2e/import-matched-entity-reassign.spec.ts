/**
 * Regression test — finance import: re-assigning the entity on an
 * already-*matched* transaction must update that card in place, not silently
 * duplicate it.
 *
 * Reproduces the reported bug: on the Review step's Matched tab, opening a
 * card's "Choose entity…" combobox and picking an entity appeared to do
 * nothing. Root cause: the reducer that moved a transaction into the `matched`
 * bucket removed prior copies only from `uncertain`/`failed`, never from
 * `matched` itself — so re-selecting on an already-matched card appended a
 * duplicate at the end of the list while leaving the clicked card (keyed by
 * index) visually unchanged.
 *
 * Flow covered:
 *   Upload a one-row CSV whose merchant the seeded matcher classifies as
 *   Matched (WOOLWORTHS METRO → alias match on the Woolworths seed entity),
 *   then on the Matched tab re-assign that card from Woolworths to Coles and
 *   assert:
 *     - the Matched tab count stays at 1 (no duplicate row appended),
 *     - exactly one card still carries the merchant description,
 *     - that single card's combobox now reads "Coles".
 *
 *   Before the fix this failed on every assertion: the tab showed (2), two
 *   cards carried the description, and the original card still read
 *   "Woolworths".
 *
 * Isolation:
 *   A dedicated env (`e2e-matched-reassign`) seeded via POST /env/<name> keeps
 *   this spec independent of the shared `e2e` env. `findSimilar` only scans
 *   uncertain/failed, so the single-row import never triggers the
 *   correction-proposal dialog.
 */
import { expect, test, type Page, type APIRequestContext } from '@playwright/test';

const API_URL = process.env['FINANCE_API_URL'] ?? 'http://localhost:3000';
const ENV_NAME = 'e2e-matched-reassign';

const MERCHANT = 'WOOLWORTHS METRO 1234';
const matchedCsv = `Date,Description,Amount
10/02/2026,${MERCHANT},87.45`;

async function resetEnvironment(request: APIRequestContext): Promise<void> {
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

async function routeAllTrpcToEnv(page: Page, envName: string): Promise<void> {
  await page.route('/trpc/**', async (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set('env', envName);
    const response = await route.fetch({ url: url.toString() });
    await route.fulfill({ response });
  });
}

async function walkToReview(page: Page, content: string, fileName: string): Promise<void> {
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: fileName,
    mimeType: 'text/csv',
    buffer: Buffer.from(content),
  });
  await expect(page.getByText(fileName)).toBeVisible();

  await page.getByRole('button', { name: /^next$/i }).click();
  await expect(page.getByRole('heading', { name: 'Map Columns' })).toBeVisible();
  await page.getByRole('button', { name: /^next$/i }).click();

  await expect(page.getByRole('heading', { name: 'Review', exact: true })).toBeVisible({
    timeout: 30_000,
  });
}

test.describe('Finance import — re-assign entity on a matched card', () => {
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

  test('picking a different entity replaces the matched card in place without duplicating it', async ({
    page,
  }) => {
    await page.goto('/finance/import');
    await walkToReview(page, matchedCsv, 'matched-reassign.csv');

    const matchedTab = page.getByRole('tab', { name: /matched/i });
    await expect(matchedTab).toHaveText(/matched.*\(1\)/i, { timeout: 10_000 });
    await matchedTab.click();

    const matchedPanel = page.getByRole('tabpanel', { name: /matched/i });
    const merchantCard = matchedPanel
      .locator('[data-testid="transaction-card"]')
      .filter({ hasText: MERCHANT })
      .filter({ visible: true });

    await expect(merchantCard).toHaveCount(1);
    await expect(merchantCard.getByRole('combobox')).toContainText('Woolworths');

    // Open the combobox and pick a *different* seeded entity.
    await merchantCard.getByRole('combobox').click();
    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();
    await listbox.getByRole('option', { name: /coles/i }).click();
    await expect(listbox).toBeHidden();

    // The reported bug: a duplicate row is appended and the clicked card is
    // left unchanged. Post-fix, the single card is updated in place.
    await expect(matchedTab).toHaveText(/matched.*\(1\)/i);

    const cardsForMerchant = matchedPanel
      .locator('[data-testid="transaction-card"]')
      .filter({ hasText: MERCHANT })
      .filter({ visible: true });
    await expect(cardsForMerchant).toHaveCount(1);
    await expect(cardsForMerchant.getByRole('combobox')).toContainText('Coles');
    await expect(cardsForMerchant.getByRole('combobox')).not.toContainText('Woolworths');
  });
});
