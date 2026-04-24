/**
 * Integration test — finance import: duplicate detection workflow (#2122).
 *
 * Tier 3: real API against an isolated seeded SQLite environment.
 *
 * Flow covered:
 *   Phase 1 — upload CSV A (3 unique rows), walk the wizard, commit.
 *             This puts 3 transactions in the DB with concrete checksums
 *             (the seeder itself leaves checksums NULL).
 *   Phase 2 — upload CSV B (2 rows byte-identical to CSV A + 1 new row),
 *             walk the wizard through the Review step and assert:
 *               - Skipped tab contains the 2 duplicated rows
 *               - Matched tab contains the 1 new row
 *             then commit and confirm the Summary step reports 1 imported.
 *
 * Isolation: a dedicated env name is used so the test does not interfere
 * with the shared `e2e` env consumed by other specs. The env is deleted +
 * recreated in beforeAll so re-runs start from the same seeded state and
 * the checksums committed by Phase 1 do not leak across runs.
 */
import { expect, test, type Page, type APIRequestContext } from '@playwright/test';

import {
  duplicateDetectionCsvReupload,
  duplicateDetectionCsvSeed,
  duplicateDetectionDescriptors,
} from './fixtures/import-duplicate-detection';

const API_URL = process.env['FINANCE_API_URL'] ?? 'http://localhost:3000';
const ENV_NAME = 'e2e-dup-detect';

async function resetEnvironment(request: APIRequestContext): Promise<void> {
  // Delete any leftover env from a previous run (410 when absent — fine).
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

/** Walk upload → map columns → wait for the Review heading. */
async function walkToReview(page: Page, content: string, fileName: string): Promise<void> {
  await uploadCsv(page, content, fileName);
  await page.getByRole('button', { name: /next/i }).click();

  await expect(page.getByText('Map Columns')).toBeVisible();
  await page.getByRole('button', { name: /next/i }).click();

  await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible({ timeout: 30_000 });
}

/** Walk Review → Tag Review → Final Review → commit → Summary heading. */
async function commitAndReachSummary(page: Page): Promise<void> {
  await page.getByRole('button', { name: /continue to tag review/i }).click();
  await expect(page.getByRole('heading', { name: 'Tag Review' })).toBeVisible({
    timeout: 10_000,
  });

  await page.getByRole('button', { name: /continue to final review/i }).click();
  await expect(page.getByRole('heading', { name: 'Final Review' })).toBeVisible({
    timeout: 10_000,
  });

  await page.getByRole('button', { name: /approve & commit all/i }).click();
  const continueBtn = page.getByRole('button', { name: /^continue$/i });
  await expect(continueBtn).toBeVisible({ timeout: 15_000 });
  await continueBtn.click();

  await expect(page.getByRole('heading', { name: 'Import Complete' })).toBeVisible({
    timeout: 10_000,
  });
}

test.describe.configure({ mode: 'serial' });

test.describe('Finance import — duplicate detection workflow (#2122)', () => {
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

  test('skips duplicate rows on re-upload and commits only the new row', async ({ page }) => {
    const { dupA, dupB, seedOnly, reuploadOnly } = duplicateDetectionDescriptors;

    // -------------------------------------------------------------------------
    // Phase 1 — seed import. Three rows land in Matched (Woolworths alias),
    // commit them all to populate DB checksums.
    // -------------------------------------------------------------------------
    await page.goto('/finance/import');
    await walkToReview(page, duplicateDetectionCsvSeed, 'dup-detect-seed.csv');

    const matchedTab = page.getByRole('tab', { name: /matched/i });
    const skippedTab = page.getByRole('tab', { name: /skipped/i });

    // All three seed rows should land in Matched (via Woolworths alias); none skipped.
    await expect(matchedTab).toHaveText(/matched.*\(3\)/i);
    await expect(skippedTab).toHaveText(/skipped.*\(0\)/i);

    await commitAndReachSummary(page);
    await expect(page.getByText('Transactions Imported')).toBeVisible();

    // -------------------------------------------------------------------------
    // Phase 2 — reset wizard, re-upload CSV B. 2 rows must be skipped on
    // checksum; 1 new row must land in Matched.
    // -------------------------------------------------------------------------
    await page.goto('/finance/import');
    await walkToReview(page, duplicateDetectionCsvReupload, 'dup-detect-reupload.csv');

    await expect(matchedTab).toHaveText(/matched.*\(1\)/i, { timeout: 10_000 });
    await expect(skippedTab).toHaveText(/skipped.*\(2\)/i);

    // Inspect the Skipped tab — both duplicated descriptions render with a
    // duplicate reason. Use .filter({ visible: true }) to ignore the
    // responsive-mirrored copies that may not be visible at test viewport.
    await skippedTab.click();
    const skippedPanel = page.getByRole('tabpanel');
    await expect(
      skippedPanel.getByRole('row').filter({ hasText: dupA }).filter({ visible: true })
    ).toHaveCount(1);
    await expect(
      skippedPanel.getByRole('row').filter({ hasText: dupB }).filter({ visible: true })
    ).toHaveCount(1);
    // Skip reason is rendered in the same row ("Duplicate transaction (checksum match)").
    await expect(skippedPanel.getByText(/duplicate/i).first()).toBeVisible();

    // The matched tab must contain the one new row (reuploadOnly) and NOT any
    // of the duplicates nor the seed-only row from Phase 1.
    await matchedTab.click();
    const matchedPanel = page.getByRole('tabpanel');
    await expect(matchedPanel.getByText(reuploadOnly).first()).toBeVisible();
    await expect(matchedPanel.getByText(dupA)).toHaveCount(0);
    await expect(matchedPanel.getByText(dupB)).toHaveCount(0);
    await expect(matchedPanel.getByText(seedOnly)).toHaveCount(0);

    // Commit phase 2 — only 1 new transaction imported. The "Transactions
    // Imported" SummaryCard stacks the value above the label inside a bordered
    // div; asserting on the nearest wrapping container avoids coupling to the
    // concrete class names.
    await commitAndReachSummary(page);
    const importedCard = page
      .locator('div.border')
      .filter({ hasText: 'Transactions Imported' })
      .first();
    await expect(importedCard).toContainText('1');
  });
});
