/**
 * Item photos service — attach/remove/reorder photos using Drizzle ORM.
 */
import { existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

import { homeInventory, itemPhotos } from '@pops/db-types';
import { asc, count, eq } from 'drizzle-orm';

import { getDb, getDrizzle } from '../../../db.js';
import { NotFoundError, ValidationError } from '../../../shared/errors.js';
import type { AttachPhotoInput, ItemPhotoRow, UpdatePhotoInput } from './types.js';

/** Reject path traversal attempts in file paths. */
function assertSafeFilePath(filePath: string): void {
  if (filePath.includes('..') || filePath.startsWith('/')) {
    throw new ValidationError("File path must be relative and cannot contain '..'");
  }
}

/** Count + rows for a paginated list. */
export interface PhotoListResult {
  rows: ItemPhotoRow[];
  total: number;
}

/** Validate that an inventory item exists. */
function assertItemExists(itemId: string): void {
  const db = getDrizzle();
  const [item] = db
    .select({ id: homeInventory.id })
    .from(homeInventory)
    .where(eq(homeInventory.id, itemId))
    .all();
  if (!item) throw new NotFoundError('Inventory item', itemId);
}

/** Get a single photo by ID. Throws NotFoundError if missing. */
function getPhoto(id: number): ItemPhotoRow {
  const db = getDrizzle();
  const [row] = db.select().from(itemPhotos).where(eq(itemPhotos.id, id)).all();
  if (!row) throw new NotFoundError('Item photo', String(id));
  return row;
}

/** Attach a photo to an inventory item. */
export function attachPhoto(input: AttachPhotoInput): ItemPhotoRow {
  const db = getDrizzle();

  assertItemExists(input.itemId);
  assertSafeFilePath(input.filePath);

  const result = db
    .insert(itemPhotos)
    .values({
      itemId: input.itemId,
      filePath: input.filePath,
      caption: input.caption ?? null,
      sortOrder: input.sortOrder,
    })
    .run();

  const id = Number(result.lastInsertRowid);
  return getPhoto(id);
}

/** Remove a photo by ID. Deletes both the database record and the file from disk. */
export function removePhoto(id: number): void {
  const photo = getPhoto(id); // Validates existence

  // Delete file from disk (best-effort — missing file is not an error)
  const baseDir = process.env.INVENTORY_IMAGES_DIR;
  if (baseDir) {
    const fullPath = resolve(baseDir, photo.filePath);
    if (existsSync(fullPath)) {
      unlinkSync(fullPath);
    }
  }

  const db = getDrizzle();
  db.delete(itemPhotos).where(eq(itemPhotos.id, id)).run();
}

/** Update a photo's caption or sort order. */
export function updatePhoto(id: number, input: UpdatePhotoInput): ItemPhotoRow {
  const db = getDrizzle();

  getPhoto(id); // Validates existence

  const updates: Partial<typeof itemPhotos.$inferInsert> = {};
  let hasUpdates = false;

  if (input.caption !== undefined) {
    updates.caption = input.caption ?? null;
    hasUpdates = true;
  }
  if (input.sortOrder !== undefined) {
    updates.sortOrder = input.sortOrder;
    hasUpdates = true;
  }

  if (hasUpdates) {
    db.update(itemPhotos).set(updates).where(eq(itemPhotos.id, id)).run();
  }

  return getPhoto(id);
}

/** List photos for an item, ordered by sortOrder. */
export function listPhotosForItem(itemId: string, limit: number, offset: number): PhotoListResult {
  const db = getDrizzle();

  const rows = db
    .select()
    .from(itemPhotos)
    .where(eq(itemPhotos.itemId, itemId))
    .orderBy(asc(itemPhotos.sortOrder))
    .limit(limit)
    .offset(offset)
    .all();

  const [countResult] = db
    .select({ total: count() })
    .from(itemPhotos)
    .where(eq(itemPhotos.itemId, itemId))
    .all();

  return { rows, total: countResult?.total ?? 0 };
}

/**
 * Reorder photos for an item. Sets sortOrder based on position
 * in the orderedIds array (0-indexed).
 */
export function reorderPhotos(itemId: string, orderedIds: number[]): ItemPhotoRow[] {
  const db = getDrizzle();
  const rawDb = getDb();

  assertItemExists(itemId);

  // Validate all photos exist and belong to this item before mutating
  for (const photoId of orderedIds) {
    const photo = getPhoto(photoId);
    if (photo.itemId !== itemId) {
      throw new NotFoundError('Item photo', String(photoId));
    }
  }

  // Apply all sort order updates in a single transaction
  rawDb.transaction(() => {
    for (let i = 0; i < orderedIds.length; i++) {
      const photoId = orderedIds[i];
      if (photoId === undefined) continue;
      db.update(itemPhotos).set({ sortOrder: i }).where(eq(itemPhotos.id, photoId)).run();
    }
  })();

  // Return all photos in new order
  return db
    .select()
    .from(itemPhotos)
    .where(eq(itemPhotos.itemId, itemId))
    .orderBy(asc(itemPhotos.sortOrder))
    .all();
}
