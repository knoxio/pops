/**
 * Smoke test — Finance import wizard happy path (#2101)
 *
 * Tier 1 minimum: walks the full 7-step import wizard end-to-end with a
 * 2-transaction CSV where the backend is fully mocked via `page.route()`:
 *
 *   1. Upload CSV         → parsed client-side (no tRPC call)
 *   2. Map Columns        → auto-detected mapping, confirm via Next
 *   3. Processing         → polls getImportProgress until `completed`
 *   4. Review             → both transactions land in Matched tab
 *   5. Tag Review         → no edits, continue
 *   6. Final Review       → Approve & Commit All
 *   7. Summary            → "Import Complete" with 2 transactions imported
 *
 * Why mocked:
 *   The import wizard orchestrates many tRPC endpoints (processImport,
 *   getImportProgress, commitImport, entities.list, corrections.list,
 *   availableTags). Exercising them against the real API in CI would be
 *   slow and flaky; the Tier-1 goal here is the UI flow, not the backend
 *   plumbing. All endpoints are stubbed via `page.route()` — no DB writes.
 *
 * Endpoints mocked:
 *   - finance.imports.processImport         → returns sessionId
 *   - finance.imports.getImportProgress     → returns status: 'completed'
 *                                             with 2 matched transactions
 *   - finance.imports.commitImport          → returns CommitResult (2 imported)
 *   - core.entities.list                    → returns the matched entities
 *   - core.corrections.list                 → empty list (used by re-eval hook)
 *   - finance.transactions.availableTags    → empty tag list (TagReviewStep)
 *
 * Crash detection is wired via beforeEach/afterEach so the test also
 * verifies the wizard doesn't throw uncaught errors during the full flow.
 */
import { expect, test } from '@playwright/test';

import type { Page, Route } from '@playwright/test';

const PROCESS_SESSION_ID = 'e2e-process-session';

/**
 * tRPC v11 `httpBatchLink` batches multiple procedures of the same type
 * (query/mutation) into a single HTTP request. The URL path becomes a
 * comma-joined list (e.g. `/trpc/core.entities.list,core.corrections.list`)
 * and the client always expects an array of envelopes matching the
 * procedure order when `?batch=1` is present.
 *
 * A single-procedure regex mock (`/\/trpc\/core\.entities\.list/`) will
 * match the batched URL prefix but can only return ONE envelope, which
 * makes the client reject the remaining items with `Missing result`.
 *
 * To handle this correctly, the test installs one `/trpc/**` route that:
 *   1. Splits the procedure path list from the URL,
 *   2. Looks up a registered payload provider for each procedure,
 *   3. Emits an envelope array matching the request order.
 */
type PayloadProvider = (input: unknown) => unknown;

/** Build a tRPC v11 success envelope. */
function envelope(data: unknown): { result: { data: unknown } } {
  return { result: { data } };
}

/**
 * Parse the `?input=...` query param for a batched tRPC request.
 * Batched inputs are keyed by positional index: `{ "0": { json: ... }, "1": ... }`.
 */
function parseBatchInputs(rawInput: string | null): Record<string, unknown> {
  if (!rawInput) return {};
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(rawInput));
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

/** Extract a single procedure's input from a parsed batch inputs bag. */
function inputAt(inputs: Record<string, unknown>, index: number): unknown {
  const entry = inputs[String(index)];
  if (entry && typeof entry === 'object' && 'json' in entry) {
    return (entry as { json: unknown }).json;
  }
  return entry;
}

/** Two matched transactions so the Review step auto-lands on Matched tab. */
const matchedTransactions = [
  {
    date: '2026-02-13',
    description: 'WOOLWORTHS 1234',
    amount: -125.5,
    account: 'Amex',
    rawRow: '{}',
    checksum: 'chk-woolworths-001',
    entity: {
      entityId: 'entity-woolworths',
      entityName: 'Woolworths',
      matchType: 'prefix' as const,
    },
    status: 'matched' as const,
  },
  {
    date: '2026-02-14',
    description: 'NETFLIX.COM',
    amount: -19.99,
    account: 'Amex',
    rawRow: '{}',
    checksum: 'chk-netflix-001',
    entity: {
      entityId: 'entity-netflix',
      entityName: 'Netflix',
      matchType: 'contains' as const,
    },
    status: 'matched' as const,
  },
];

const processedOutput = {
  matched: matchedTransactions,
  uncertain: [],
  failed: [],
  skipped: [],
  warnings: [],
};

/**
 * Map of tRPC procedure path → function producing the raw return value
 * (pre-envelope). Procedures not listed here fall through to a 404 so
 * unexpected calls surface as visible failures.
 */
const payloadProviders: Record<string, PayloadProvider> = {
  'finance.imports.processImport': () => ({ sessionId: PROCESS_SESSION_ID }),
  'finance.imports.getImportProgress': () => ({
    sessionId: PROCESS_SESSION_ID,
    status: 'completed',
    result: processedOutput,
  }),
  // commitImport router wraps its result as `{ data, message }`.
  'finance.imports.commitImport': () => ({
    data: {
      entitiesCreated: 0,
      rulesApplied: { add: 0, edit: 0, disable: 0, remove: 0 },
      tagRulesApplied: 0,
      transactionsImported: 2,
      transactionsFailed: 0,
      failedDetails: [],
      retroactiveReclassifications: 0,
    },
    message: 'Import committed',
  }),
  // entities.list router returns `{ data, pagination }`.
  'core.entities.list': () => ({
    data: [
      { id: 'entity-woolworths', name: 'Woolworths', type: 'company' },
      { id: 'entity-netflix', name: 'Netflix', type: 'company' },
    ],
    pagination: { total: 2, limit: 50, offset: 0, hasMore: false },
  }),
  'core.corrections.list': () => ({
    data: [],
    pagination: { total: 0, limit: 50, offset: 0, hasMore: false },
  }),
  'finance.transactions.availableTags': () => [],
};

async function handleTrpcRoute(route: Route): Promise<void> {
  const url = new URL(route.request().url());
  // The pathname looks like `/trpc/core.entities.list,core.corrections.list`.
  const pathSegment = url.pathname.replace(/^.*\/trpc\//, '');
  const procedures = pathSegment.split(',').filter(Boolean);
  const isBatch = url.searchParams.has('batch');
  const inputs = parseBatchInputs(url.searchParams.get('input'));

  const envelopes = procedures.map((procedure, index) => {
    const provider = payloadProviders[procedure];
    if (!provider) {
      // Return a tRPC-shaped error so the client surfaces it instead of
      // rejecting with the opaque "Missing result" message.
      return {
        error: {
          json: {
            message: `Unmocked procedure: ${procedure}`,
            code: -32603,
            data: {
              code: 'INTERNAL_SERVER_ERROR',
              httpStatus: 500,
              path: procedure,
            },
          },
        },
      };
    }
    return envelope(provider(inputAt(inputs, index)));
  });

  const body = isBatch ? envelopes : envelopes[0];
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function setupMocks(page: Page): Promise<void> {
  await page.route('**/trpc/**', handleTrpcRoute);
}

const csvContent = `Date,Description,Amount
13/02/2026,WOOLWORTHS 1234,125.50
14/02/2026,NETFLIX.COM,19.99`;

test.describe('Finance — import wizard happy path (mocked)', () => {
  let pageErrors: string[] = [];
  let consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    pageErrors = [];
    consoleErrors = [];
    // Register listeners before navigation so first-load errors are captured.
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    await setupMocks(page);
    await page.goto('/finance/import');
    await expect(page.getByRole('heading', { name: 'Upload CSV' })).toBeVisible();
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

  test('walks upload → map → process → review → tags → commit → summary', async ({ page }) => {
    // Step 1: Upload CSV — the <input type="file"> sits inside the drop zone.
    await page.locator('input[type="file"]').setInputFiles({
      name: 'amex-feb-2026.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csvContent),
    });
    // The selected-file card shows the filename once accepted.
    await expect(page.getByText('amex-feb-2026.csv')).toBeVisible();
    await page.getByRole('button', { name: /^next$/i }).click();

    // Step 2: Map Columns — autoDetectColumns maps Date/Description/Amount.
    await expect(page.getByRole('heading', { name: 'Map Columns' })).toBeVisible();
    await expect(page.locator('select[name="date"]')).toHaveValue('Date');
    await expect(page.locator('select[name="description"]')).toHaveValue('Description');
    await expect(page.locator('select[name="amount"]')).toHaveValue('Amount');
    await page.getByRole('button', { name: /^next$/i }).click();

    // Step 3: Processing — polls progress until status=completed, then auto-advances.
    // Wait for the Review heading to confirm polling worked.
    await expect(page.getByRole('heading', { name: 'Review', exact: true })).toBeVisible({
      timeout: 10_000,
    });

    // Step 4: Review — both transactions land in Matched (2).
    // TabsTrigger labels render as "Matched (2)", etc.
    await expect(page.getByRole('tab', { name: /matched.*\(2\)/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /uncertain.*\(0\)/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /failed.*\(0\)/i })).toBeVisible();

    // Both matched transactions are visible in the Matched tabpanel.
    const matchedPanel = page.getByRole('tabpanel');
    await expect(matchedPanel.getByText('WOOLWORTHS 1234').first()).toBeVisible();
    await expect(matchedPanel.getByText('NETFLIX.COM').first()).toBeVisible();

    // Continue to Tag Review — button label is "Continue to Tag Review (2)".
    await page.getByRole('button', { name: /continue to tag review/i }).click();

    // Step 5: Tag Review — no changes, continue.
    await expect(page.getByRole('heading', { name: 'Tag Review' })).toBeVisible({
      timeout: 5_000,
    });
    await page.getByRole('button', { name: /continue to final review/i }).click();

    // Step 6: Final Review — approve & commit.
    await expect(page.getByRole('heading', { name: 'Final Review' })).toBeVisible({
      timeout: 5_000,
    });
    await page.getByRole('button', { name: /approve & commit all/i }).click();

    // CommitResultPanel appears on success; the footer button switches to "Continue".
    await expect(page.getByRole('heading', { name: 'Commit Successful' })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole('button', { name: /^continue$/i }).click();

    // Step 7: Summary — success state with transaction count card.
    await expect(page.getByRole('heading', { name: 'Import Complete' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText('Transactions Imported')).toBeVisible();
    // The SummaryCard for imported transactions shows the value "2".
    await expect(page.getByRole('button', { name: /new import/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /view transactions/i })).toBeVisible();
  });
});
