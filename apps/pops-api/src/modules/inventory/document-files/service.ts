/**
 * Item uploaded files service — direct (non-Paperless) uploads attached to an
 * inventory item. Mirrors the photos service: writes the bytes to disk under
 * `INVENTORY_DOCUMENTS_DIR/items/{itemId}/`, then records a DB row.
 */
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

import { desc, count, eq } from 'drizzle-orm';

import { homeInventory, itemUploadedFiles } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { NotFoundError, ValidationError } from '../../../shared/errors.js';
import { getInventoryDocumentsDir } from './paths.js';
import {
  ALLOWED_MIME_PREFIXES,
  getMaxFileSizeBytes,
  type ItemUploadedFileRow,
  type UploadDocumentInput,
} from './types.js';

/** Count + rows for a paginated list. */
export interface UploadedFileListResult {
  rows: ItemUploadedFileRow[];
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

/** Get a single uploaded file by ID. Throws NotFoundError if missing. */
function getUploadedFile(id: number): ItemUploadedFileRow {
  const db = getDrizzle();
  const [row] = db.select().from(itemUploadedFiles).where(eq(itemUploadedFiles.id, id)).all();
  if (!row) throw new NotFoundError('Item uploaded file', String(id));
  return row;
}

/**
 * Reject path-traversal attempts and disallowed characters in a user-supplied
 * file name. We strip the directory portion (basename) and check the result
 * is non-empty and free of slashes / `..`.
 */
function sanitiseUploadFileName(rawName: string): string {
  const trimmed = rawName.trim();
  if (!trimmed) throw new ValidationError('File name is required');
  // basename() handles both `/` and Windows-style `\` separators on POSIX.
  const last = trimmed.split(/[\\/]/).pop() ?? '';
  if (!last || last === '.' || last === '..' || last.includes('/') || last.includes('\\')) {
    throw new ValidationError('Invalid file name');
  }
  return last;
}

function assertAllowedMime(mimeType: string): void {
  const ok = ALLOWED_MIME_PREFIXES.some((prefix) =>
    prefix.endsWith('/') ? mimeType.startsWith(prefix) : mimeType === prefix
  );
  if (!ok) {
    throw new ValidationError(
      `Unsupported MIME type: ${mimeType}. Allowed: PDF, images, plain text.`
    );
  }
}

function assertWithinSizeLimit(buffer: Buffer): void {
  const maxFileSize = getMaxFileSizeBytes();
  if (buffer.byteLength > maxFileSize) {
    throw new ValidationError(`File too large: ${buffer.byteLength} bytes (max ${maxFileSize})`);
  }
}

/**
 * Determine the next sequential file path within an item's directory.
 * Returns a path like `items/{itemId}/file_001.pdf`. Sequence is shared
 * across all extensions so two uploads on the same item never collide.
 */
function nextFilenameForItem(baseDir: string, itemId: string, originalName: string): string {
  const itemDir = join(baseDir, 'items', itemId);
  mkdirSync(itemDir, { recursive: true });

  const existing = existsSync(itemDir)
    ? readdirSync(itemDir).filter((f) => /^file_\d+\./.test(f))
    : [];

  const nextNum = existing.length + 1;
  const seq = String(nextNum).padStart(3, '0');
  // Preserve the original extension (lower-cased) so MIME type detection works
  // for the static-file route. Default to `.bin` if extension missing.
  const ext = extname(originalName).toLowerCase() || '.bin';
  return join('items', itemId, `file_${seq}${ext}`);
}

/** Upload a document and attach it to an inventory item. */
export function uploadDocument(input: UploadDocumentInput): ItemUploadedFileRow {
  const db = getDrizzle();

  assertItemExists(input.itemId);
  const safeName = sanitiseUploadFileName(input.fileName);
  assertAllowedMime(input.mimeType);
  assertWithinSizeLimit(input.buffer);

  const baseDir = getInventoryDocumentsDir();
  const relPath = nextFilenameForItem(baseDir, input.itemId, safeName);
  const fullPath = resolve(baseDir, relPath);
  writeFileSync(fullPath, input.buffer);

  const result = db
    .insert(itemUploadedFiles)
    .values({
      itemId: input.itemId,
      fileName: safeName,
      filePath: relPath,
      mimeType: input.mimeType,
      fileSize: input.buffer.byteLength,
    })
    .run();

  const id = Number(result.lastInsertRowid);
  return getUploadedFile(id);
}

/** Remove an uploaded file by ID. Deletes both the DB record and the disk file. */
export function removeUpload(id: number): void {
  const file = getUploadedFile(id); // Validates existence

  // Delete file from disk (best-effort — missing file is not an error)
  const baseDir = getInventoryDocumentsDir();
  const fullPath = resolve(baseDir, file.filePath);
  if (existsSync(fullPath)) {
    unlinkSync(fullPath);
  }

  const db = getDrizzle();
  db.delete(itemUploadedFiles).where(eq(itemUploadedFiles.id, id)).run();
}

/** List uploaded files for an item, newest first. */
export function listUploadsForItem(
  itemId: string,
  limit: number,
  offset: number
): UploadedFileListResult {
  const db = getDrizzle();

  const rows = db
    .select()
    .from(itemUploadedFiles)
    .where(eq(itemUploadedFiles.itemId, itemId))
    .orderBy(desc(itemUploadedFiles.uploadedAt), desc(itemUploadedFiles.id))
    .limit(limit)
    .offset(offset)
    .all();

  const [countResult] = db
    .select({ total: count() })
    .from(itemUploadedFiles)
    .where(eq(itemUploadedFiles.itemId, itemId))
    .all();

  return { rows, total: countResult?.total ?? 0 };
}
