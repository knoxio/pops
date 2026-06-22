/**
 * Tier 3 — Inventory: photo upload, reorder, and delete on item (#2125)
 *
 * Flow:
 *   1. Pre-clean: remove any photos previously attached to the test item.
 *   2. Navigate to the item edit page (the only place upload UI is exposed).
 *   3. Upload two small PNG fixtures via the hidden <input type="file">.
 *      The form's photo section uploads immediately on file select — no Save
 *      Changes click is needed, so the WebKit reset() bug (#2175) and the
 *      navigation drop bug (#2157) are both side-stepped.
 *   4. Wait for both photos to appear in the SortablePhotoGrid (`role="listitem"`).
 *   5. Navigate to the detail page and confirm both thumbnail cells render
 *      in the gallery's reorder grid.
 *   6. Reorder via synthetic HTML5 drag events dispatched in-page. Native
 *      Playwright dragTo() and mouse drag are unreliable on WebKit when the
 *      target is bound only to drag events (not mouse events), so we fire
 *      `dragstart` → `dragover` → `drop` → `dragend` directly via DOM.
 *   7. Reload the detail page and confirm the new order persists across reload.
 *   8. Return to edit, click the trash button on one photo, confirm the inline
 *      prompt, and assert exactly one photo cell remains.
 *
 * Idempotency: a beforeEach + afterEach pair drains all photos for the test
 * item via `inventory.photos.remove`, so the test can run repeatedly against
 * the long-lived `e2e` SQLite environment without state bleed.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

const TEST_ITEM_ID = 'inv-005'; // Breville Barista Express — no seeded photos.
const E2E_ENV = 'e2e';
const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/', import.meta.url));
const FIXTURE_RED = `${FIXTURE_DIR}photo-red.png`;
const FIXTURE_BLUE = `${FIXTURE_DIR}photo-blue.png`;
const PHOTO_CELL = '[role="listitem"][aria-label^="Photo "]';

interface PhotoListResponse {
  result: { data: { data: { id: number; sortOrder: number }[] } };
}

/** Read fixture bytes for setInputFiles. */
function loadFixture(absPath: string): { name: string; mimeType: string; buffer: Buffer } {
  const buffer = readFileSync(absPath);
  const name = absPath.split('/').pop() ?? 'photo.png';
  return { name, mimeType: 'image/png', buffer };
}

/** List all photos for the test item via the real API. */
async function listPhotos(req: APIRequestContext): Promise<{ id: number; sortOrder: number }[]> {
  const input = encodeURIComponent(JSON.stringify({ itemId: TEST_ITEM_ID }));
  const res = await req.get(
    `http://localhost:3000/trpc/inventory.photos.listForItem?env=${E2E_ENV}&input=${input}`
  );
  if (!res.ok()) throw new Error(`listPhotos failed: ${res.status()}`);
  const body = (await res.json()) as PhotoListResponse;
  return body.result.data.data;
}

/** Delete every photo currently attached to the test item. */
async function purgePhotos(req: APIRequestContext): Promise<void> {
  const photos = await listPhotos(req);
  for (const p of photos) {
    const res = await req.post(
      `http://localhost:3000/trpc/inventory.photos.remove?env=${E2E_ENV}`,
      {
        data: { id: p.id },
      }
    );
    if (!res.ok()) throw new Error(`purgePhotos failed for ${p.id}: ${res.status()}`);
  }
}

/**
 * Fire a synthetic HTML5 drag sequence (dragstart → dragover → drop → dragend)
 * from the cell at `fromIndex` to the cell at `toIndex`. Done in-page via
 * dispatchEvent because Playwright's mouse-based dragTo is unreliable on
 * WebKit for elements bound only to native drag events.
 */
async function dragPhotoCell(page: Page, fromIndex: number, toIndex: number): Promise<void> {
  await page.evaluate(
    ({ from, to, selector }) => {
      const cells = document.querySelectorAll<HTMLElement>(selector);
      const source = cells[from];
      const target = cells[to];
      if (!source || !target) {
        throw new Error(`drag cell missing — from=${from} to=${to} count=${cells.length}`);
      }
      const dataTransfer = new DataTransfer();
      const fire = (el: HTMLElement, type: string): void => {
        const event = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer });
        el.dispatchEvent(event);
      };
      fire(source, 'dragstart');
      fire(target, 'dragover');
      fire(target, 'drop');
      fire(source, 'dragend');
    },
    { from: fromIndex, to: toIndex, selector: PHOTO_CELL }
  );
}

/** Resolve the file path for the photo cell at `index` (the bit after baseUrl/). */
async function getPhotoFilePath(page: Page, index: number): Promise<string> {
  const src = await page.locator(PHOTO_CELL).nth(index).locator('img').getAttribute('src');
  if (!src) throw new Error(`no img src at index ${index}`);
  // src looks like /api/inventory/photos/items%2Finv-005%2Fphoto_001.jpg
  const last = src.split('/').pop() ?? '';
  return decodeURIComponent(last);
}

test.describe('Inventory — photo upload, reorder, delete (#2125)', () => {
  test.beforeEach(async ({ page, request }) => {
    await purgePhotos(request);
    await useRealApi(page);
  });

  test.afterEach(async ({ page, request }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await purgePhotos(request);
  });

  test('uploads two photos, reorders them, persists across reload, then deletes one', async ({
    page,
  }) => {
    // ---------------------------------------------------------------------
    // 1. Upload two PNGs via the edit page's hidden multiple-file input.
    //    No form submit needed — uploads fire the moment files are selected.
    // ---------------------------------------------------------------------
    await page.goto(`/inventory/items/${TEST_ITEM_ID}/edit`);
    await expect(page.getByRole('heading', { name: 'Photos' })).toBeVisible({ timeout: 15_000 });

    const fileInput = page.getByTestId('photo-upload-input');
    await fileInput.setInputFiles([loadFixture(FIXTURE_RED), loadFixture(FIXTURE_BLUE)]);

    // SortablePhotoGrid renders one cell per existing photo. Wait for both.
    await expect(page.locator(PHOTO_CELL)).toHaveCount(2, { timeout: 30_000 });

    // ---------------------------------------------------------------------
    // 2. Detail page shows both thumbnails in its reorder grid.
    // ---------------------------------------------------------------------
    await page.goto(`/inventory/items/${TEST_ITEM_ID}`);
    await expect(page.getByRole('heading', { name: /^Photos/ })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(PHOTO_CELL)).toHaveCount(2, { timeout: 10_000 });

    const firstBeforePath = await getPhotoFilePath(page, 0);
    const secondBeforePath = await getPhotoFilePath(page, 1);
    expect(firstBeforePath).not.toBe(secondBeforePath);

    // ---------------------------------------------------------------------
    // 3. Drag the second cell onto the first slot, then verify the order
    //    has flipped via the rendered img src (which encodes filePath).
    // ---------------------------------------------------------------------
    await dragPhotoCell(page, 1, 0);

    await expect.poll(() => getPhotoFilePath(page, 0), { timeout: 10_000 }).toBe(secondBeforePath);
    await expect.poll(() => getPhotoFilePath(page, 1), { timeout: 10_000 }).toBe(firstBeforePath);

    // ---------------------------------------------------------------------
    // 4. Reload — the new order is loaded fresh from the DB.
    // ---------------------------------------------------------------------
    await page.reload();
    await expect(page.locator(PHOTO_CELL)).toHaveCount(2, { timeout: 10_000 });
    await expect.poll(() => getPhotoFilePath(page, 0), { timeout: 10_000 }).toBe(secondBeforePath);
    await expect.poll(() => getPhotoFilePath(page, 1), { timeout: 10_000 }).toBe(firstBeforePath);

    // ---------------------------------------------------------------------
    // 5. Delete the first photo from the edit page. The grid uses an inline
    //    confirm prompt (not an AlertDialog), so we click the trash button
    //    then the Delete button inside the confirmation strip.
    // ---------------------------------------------------------------------
    await page.goto(`/inventory/items/${TEST_ITEM_ID}/edit`);
    await expect(page.locator(PHOTO_CELL)).toHaveCount(2, { timeout: 15_000 });

    const firstCell = page.locator(PHOTO_CELL).first();
    await firstCell.locator('button[aria-label^="Delete photo"]').click();
    await expect(page.getByText(/Delete this photo\? This cannot be undone\./)).toBeVisible();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(page.locator(PHOTO_CELL)).toHaveCount(1, { timeout: 15_000 });
  });
});
