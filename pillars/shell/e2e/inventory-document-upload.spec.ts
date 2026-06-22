/**
 * Tier 3 — Inventory: document upload, download link, and delete on item (#2126)
 *
 * Flow:
 *   1. Pre-clean: remove any uploaded documents previously attached to the
 *      test item so the test is idempotent against the long-lived `e2e`
 *      SQLite environment.
 *   2. Navigate to the item edit page (the only place the document upload
 *      surface is exposed).
 *   3. Upload a small text fixture via the hidden Documents `<input
 *      type="file">`. The form's document section uploads immediately on
 *      file select, mirroring the photo flow.
 *   4. Wait for the new row to appear in the documents list and assert the
 *      download link is non-empty.
 *   5. Click the row's trash button, confirm the inline prompt, and assert
 *      the row is removed.
 *
 * Idempotency: a beforeEach + afterEach pair drains all uploaded documents
 * for the test item via `inventory.documentFiles.removeUpload`.
 */
import { expect, test, type APIRequestContext } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

const TEST_ITEM_ID = 'inv-006'; // HDMI Cable — no seeded uploaded files.
const E2E_ENV = 'e2e';
const DOCUMENT_ROW = '[data-testid="document-row"]';

interface DocumentListResponse {
  result: { data: { data: { id: number; fileName: string; filePath: string }[] } };
}

/** List all uploaded documents for the test item via the real API. */
async function listDocuments(
  req: APIRequestContext
): Promise<{ id: number; fileName: string; filePath: string }[]> {
  const input = encodeURIComponent(JSON.stringify({ itemId: TEST_ITEM_ID }));
  const res = await req.get(
    `http://localhost:3000/trpc/inventory.documentFiles.listForItem?env=${E2E_ENV}&input=${input}`
  );
  if (!res.ok()) throw new Error(`listDocuments failed: ${res.status()}`);
  const body = (await res.json()) as DocumentListResponse;
  return body.result.data.data;
}

/** Delete every uploaded document currently attached to the test item. */
async function purgeDocuments(req: APIRequestContext): Promise<void> {
  const documents = await listDocuments(req);
  for (const doc of documents) {
    const res = await req.post(
      `http://localhost:3000/trpc/inventory.documentFiles.removeUpload?env=${E2E_ENV}`,
      { data: { id: doc.id } }
    );
    if (!res.ok()) throw new Error(`purgeDocuments failed for ${doc.id}: ${res.status()}`);
  }
}

test.describe('Inventory — document upload, download, delete (#2126)', () => {
  test.beforeEach(async ({ page, request }) => {
    await purgeDocuments(request);
    await useRealApi(page);
  });

  test.afterEach(async ({ page, request }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await purgeDocuments(request);
  });

  test('uploads a document, exposes a download link, then deletes it', async ({ page }) => {
    // ---------------------------------------------------------------------
    // 1. Open the item edit page and locate the Documents section.
    // ---------------------------------------------------------------------
    await page.goto(`/inventory/items/${TEST_ITEM_ID}/edit`);
    await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible({
      timeout: 15_000,
    });

    // The empty-state placeholder is shown when no documents exist.
    await expect(page.getByTestId('document-list-empty')).toBeVisible();

    // ---------------------------------------------------------------------
    // 2. Upload a small text fixture via the hidden <input type="file">
    //    inside the document upload section.
    // ---------------------------------------------------------------------
    const fileInput = page.locator('[data-testid="document-upload-input"]');
    const fixtureName = `e2e-receipt-${Date.now()}.txt`;
    await fileInput.setInputFiles({
      name: fixtureName,
      mimeType: 'text/plain',
      buffer: Buffer.from('e2e document upload fixture body\n'),
    });

    // ---------------------------------------------------------------------
    // 3. Row appears in the list with the original filename and a working
    //    download link.
    // ---------------------------------------------------------------------
    await expect(page.locator(DOCUMENT_ROW)).toHaveCount(1, { timeout: 15_000 });
    const row = page.locator(DOCUMENT_ROW).first();
    await expect(row).toContainText(fixtureName);

    const downloadLink = row.locator('[data-testid="document-download-link"]');
    const href = await downloadLink.getAttribute('href');
    expect(href).toBeTruthy();
    expect(href).not.toBe('');
    expect(href).toMatch(/\/api\/inventory\/documents\/items\//);

    // ---------------------------------------------------------------------
    // 4. Delete via the per-row trash button + inline confirmation strip.
    // ---------------------------------------------------------------------
    await row.locator('[data-testid="document-delete-button"]').click();
    await expect(page.getByText(/Delete this document\? This cannot be undone\./)).toBeVisible();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(page.locator(DOCUMENT_ROW)).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByTestId('document-list-empty')).toBeVisible();
  });
});
