/**
 * Smoke test — Finance import wizard happy path (#2101)
 *
 * Tier 1 minimum: walks the full 8-step import wizard end-to-end with a
 * 2-transaction CSV where the backend is fully mocked via `page.route()`:
 *
 *   1. Upload CSV         → parsed client-side (no REST call)
 *   2. Map Columns        → auto-detected mapping, confirm via Next
 *   3. Processing         → polls GET /imports/progress until `completed`
 *   4. Review             → both transactions land in Matched tab
 *   5. Tag Review         → no edits, continue
 *   6. Create Rules       → skip (no patterns in mocked data)
 *   7. Final Review       → Approve & Commit All
 *   8. Summary            → "Import Complete" with 2 transactions imported
 *
 * Why mocked:
 *   The import wizard orchestrates many REST endpoints across the finance and
 *   core pillars. Exercising them against real pillar backends in CI would be
 *   slow and flaky (and the backends are not started for e2e); the Tier-1 goal
 *   here is the UI flow, not the backend plumbing. All endpoints are stubbed
 *   via `page.route()` — no DB writes.
 *
 * The wizard reads its data via the generated finance/core Hey API clients
 * (`@pops/app-finance`), which target the shell's `/finance-api` and
 * `/core-api` proxy paths (the prefix is stripped before forwarding). Each
 * route returns the plain REST body the Hey client unwraps — NOT a tRPC
 * `{ result: { data } }` envelope.
 *
 * Endpoints mocked (happy path):
 *   POST /finance-api/imports/process              → { sessionId }
 *   GET  /finance-api/imports/progress             → { status:'completed', result:{matched:[…2…]} }
 *   POST /finance-api/imports/commit               → { data:{ transactionsImported:2 … }, message }
 *   GET  /core-api/entities                        → { data:[], pagination }
 *   GET  /finance-api/transactions/available-tags  → { tags:[] }
 *
 * Crash detection is wired via beforeEach/afterEach so the test also
 * verifies the wizard doesn't throw uncaught errors during the full flow.
 */
import { expect, test } from '@playwright/test';

import type { Page, Route } from '@playwright/test';

const PROCESS_SESSION_ID = 'e2e-process-session';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Two matched transactions so the Review step auto-lands on the Matched tab. */
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

function progressBody(result: unknown) {
  return {
    sessionId: PROCESS_SESSION_ID,
    status: 'completed' as const,
    startedAt: '2026-02-14T00:00:00.000Z',
    totalTransactions: 2,
    processedCount: 2,
    currentStep: 'matching' as const,
    currentBatch: [],
    errors: [],
    result,
  };
}

const commitBody = {
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
};

const emptyEntitiesBody = {
  data: [],
  pagination: { total: 0, limit: 50, offset: 0, hasMore: false },
};

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function setupMocks(page: Page): Promise<void> {
  await page.route('**/finance-api/imports/process', (route) =>
    fulfillJson(route, { sessionId: PROCESS_SESSION_ID })
  );
  await page.route('**/finance-api/imports/progress?**', (route) =>
    fulfillJson(route, progressBody(processedOutput))
  );
  await page.route('**/finance-api/imports/commit', (route) => fulfillJson(route, commitBody));
  await page.route('**/core-api/entities?**', (route) => fulfillJson(route, emptyEntitiesBody));
  await page.route('**/finance-api/transactions/available-tags', (route) =>
    fulfillJson(route, { tags: [] })
  );
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

    // Step 6: Create Rules — no patterns in mocked test, skip.
    await page.getByRole('button', { name: /^skip$/i }).click();

    // Step 7: Final Review — approve & commit.
    await expect(page.getByRole('heading', { name: 'Final Review' })).toBeVisible({
      timeout: 5_000,
    });
    await page.getByRole('button', { name: /approve & commit all/i }).click();

    // Step 8: Summary — wizard auto-advances on commit success, no Continue click.
    await expect(page.getByRole('heading', { name: 'Import Complete' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText('Transactions Imported')).toBeVisible();
    // The SummaryCard for imported transactions shows the value "2".
    await expect(page.getByRole('button', { name: /new import/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /view transactions/i })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Correction Proposal Dialog tests
// ---------------------------------------------------------------------------
// Verifies that editing a rule field (e.g. Transaction type) auto-reruns the
// combined preview so Apply ChangeSet stays reachable without the user clicking
// the ↺ refresh button.
//
// REST flow exercised (all under /finance-api unless noted):
//   POST /imports/process                 → { sessionId }
//   GET  /imports/progress                → { status:'completed', result:{ uncertain:[1] } }
//   GET  /core-api/entities               → the candidate entity
//   POST /corrections/analyze             → { data:{ pattern, matchType, confidence } }
//   POST /corrections/propose-changeset   → { changeSet:{ ops:[add] }, preview, rationale, targetRules }
//   POST /corrections/preview-changeset   → { diffs, summary }  (initial + after type change)
//   POST /imports/reevaluate-pending      → { affectedCount, result }  (after local Apply)
//   GET  /transactions/available-tags     → { tags:[] }
//
// Note: "Apply ChangeSet" stages the change locally (Zustand store) — it does
// NOT hit a corrections/apply endpoint. The follow-on network call is
// /imports/reevaluate-pending, fired by the pendingChangeSets change.

test.describe('Correction Proposal Dialog (mocked)', () => {
  const UNCERTAIN_ENTITY_ID = 'entity-woolworths';
  const UNCERTAIN_ENTITY_NAME = 'Woolworths';
  const UNCERTAIN_CHECKSUM = 'chk-unknown-001';

  const uncertainTransaction = {
    date: '2026-02-14',
    description: 'UNKNOWN MERCHANT',
    amount: -50.0,
    account: 'Amex',
    rawRow: '{}',
    checksum: UNCERTAIN_CHECKSUM,
    entity: { matchType: 'none' as const },
    status: 'uncertain' as const,
  };

  const processedWithUncertain = {
    matched: [],
    uncertain: [uncertainTransaction],
    failed: [],
    skipped: [],
    warnings: [],
  };

  const proposeBody = {
    changeSet: {
      ops: [
        {
          op: 'add' as const,
          data: {
            descriptionPattern: 'UNKNOWN MERCHANT',
            matchType: 'contains' as const,
            entityName: UNCERTAIN_ENTITY_NAME,
            entityId: UNCERTAIN_ENTITY_ID,
            tags: [],
          },
        },
      ],
      reason: 'Rule for UNKNOWN MERCHANT',
      source: 'correction-proposal',
    },
    preview: {
      affected: [
        {
          transactionId: UNCERTAIN_CHECKSUM,
          description: 'UNKNOWN MERCHANT',
          before: {
            entityId: null,
            entityName: null,
            location: null,
            ruleId: null,
            tags: [],
            transactionType: 'purchase' as const,
          },
          after: {
            entityId: UNCERTAIN_ENTITY_ID,
            entityName: UNCERTAIN_ENTITY_NAME,
            location: null,
            ruleId: null,
            tags: [],
            transactionType: 'purchase' as const,
          },
        },
      ],
      counts: { affected: 1, entityChanges: 1, locationChanges: 0, tagChanges: 0, typeChanges: 0 },
    },
    rationale: 'Rule for UNKNOWN MERCHANT',
    targetRules: {},
  };

  const previewBody = {
    diffs: [
      {
        description: 'UNKNOWN MERCHANT',
        checksum: UNCERTAIN_CHECKSUM,
        changed: true,
        before: { confidence: null, matched: false, ruleId: null, status: 'uncertain' as const },
        after: { confidence: 0.95, matched: true, ruleId: null, status: 'matched' as const },
      },
    ],
    summary: { netMatchedDelta: 1, newMatches: 1, removedMatches: 0, statusChanges: 1, total: 1 },
  };

  const reevaluateBody = {
    affectedCount: 1,
    result: {
      matched: [{ ...uncertainTransaction, status: 'matched' as const }],
      uncertain: [],
      failed: [],
      skipped: [],
    },
  };

  const candidateEntitiesBody = {
    data: [
      {
        id: UNCERTAIN_ENTITY_ID,
        name: UNCERTAIN_ENTITY_NAME,
        type: 'company',
        abn: null,
        aliases: [],
        defaultTags: [],
        defaultTransactionType: null,
        notes: null,
        lastEditedTime: '2026-02-14T00:00:00.000Z',
      },
    ],
    pagination: { total: 1, limit: 50, offset: 0, hasMore: false },
  };

  async function setupCorrectionMocks(page: Page): Promise<void> {
    await page.route('**/finance-api/imports/process', (route) =>
      fulfillJson(route, { sessionId: PROCESS_SESSION_ID })
    );
    await page.route('**/finance-api/imports/progress?**', (route) =>
      fulfillJson(route, progressBody(processedWithUncertain))
    );
    await page.route('**/finance-api/imports/reevaluate-pending', (route) =>
      fulfillJson(route, reevaluateBody)
    );
    await page.route('**/core-api/entities?**', (route) =>
      fulfillJson(route, candidateEntitiesBody)
    );
    await page.route('**/finance-api/corrections/analyze', (route) =>
      fulfillJson(route, {
        data: { pattern: 'UNKNOWN MERCHANT', matchType: 'contains', confidence: 0.9 },
      })
    );
    await page.route('**/finance-api/corrections/propose-changeset', (route) =>
      fulfillJson(route, proposeBody)
    );
    await page.route('**/finance-api/corrections/preview-changeset', (route) =>
      fulfillJson(route, previewBody)
    );
    await page.route('**/finance-api/corrections?**', (route) =>
      fulfillJson(route, emptyEntitiesBody)
    );
    await page.route('**/finance-api/transactions/available-tags', (route) =>
      fulfillJson(route, { tags: [] })
    );
  }

  async function navigateToCorrectionProposal(page: Page): Promise<void> {
    const correctionCsv = `Date,Description,Amount\n14/02/2026,UNKNOWN MERCHANT,50.00`;
    await page.locator('input[type="file"]').setInputFiles({
      name: 'test.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(correctionCsv),
    });
    await page.getByRole('button', { name: /^next$/i }).click();
    await expect(page.getByRole('heading', { name: 'Map Columns' })).toBeVisible();
    await page.getByRole('button', { name: /^next$/i }).click();
    await expect(page.getByRole('heading', { name: 'Review', exact: true })).toBeVisible({
      timeout: 10_000,
    });

    // Switch to Grouped view and open the entity picker on the uncertain group
    await page.getByRole('button', { name: /grouped/i }).click();
    const group = page.getByTestId('transaction-group').first();
    await group.getByRole('button', { name: /choose existing/i }).click();
    await group.locator('select').selectOption(UNCERTAIN_ENTITY_ID);
  }

  test.beforeEach(async ({ page }) => {
    await setupCorrectionMocks(page);
    await page.goto('/finance/import');
    await expect(page.getByRole('heading', { name: 'Upload CSV' })).toBeVisible();
  });

  test('dialog opens when an entity is chosen for an uncertain transaction', async ({ page }) => {
    await navigateToCorrectionProposal(page);
    await expect(page.getByText('Correction proposal')).toBeVisible({ timeout: 8000 });
  });

  test('Apply ChangeSet is enabled after initial preview runs', async ({ page }) => {
    await navigateToCorrectionProposal(page);
    await expect(page.getByText('Correction proposal')).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole('button', { name: /Apply ChangeSet/i })).toBeEnabled({
      timeout: 10000,
    });
  });

  test('changing Transaction type auto-reruns preview and re-enables Apply', async ({ page }) => {
    await navigateToCorrectionProposal(page);
    await expect(page.getByText('Correction proposal')).toBeVisible({ timeout: 8000 });
    const applyBtn = page.getByRole('button', { name: /Apply ChangeSet/i });
    await expect(applyBtn).toBeEnabled({ timeout: 10000 });

    // Change Transaction type — this is the bug scenario the fix addresses.
    // Before the fix: Apply would stay disabled (dirty flag never cleared).
    // After the fix: the combined-preview effect detects the sig change and
    // auto-reruns, clearing dirty and re-enabling Apply.
    const dialog = page.getByRole('dialog', { name: /Correction proposal/i });
    await dialog
      .locator('select')
      .filter({ has: page.locator('option[value="purchase"]') })
      .selectOption('purchase');

    // Apply must re-enable WITHOUT the user manually clicking ↺
    await expect(applyBtn).toBeEnabled({ timeout: 10000 });
    await expect(page.getByText(/Preview stale/i)).not.toBeVisible();
  });

  test('Apply ChangeSet closes the dialog', async ({ page }) => {
    await navigateToCorrectionProposal(page);
    await expect(page.getByText('Correction proposal')).toBeVisible({ timeout: 8000 });
    const applyBtn = page.getByRole('button', { name: /Apply ChangeSet/i });
    await expect(applyBtn).toBeEnabled({ timeout: 10000 });
    await applyBtn.click();
    await expect(page.getByText('Correction proposal')).not.toBeVisible({ timeout: 5000 });
  });
});
