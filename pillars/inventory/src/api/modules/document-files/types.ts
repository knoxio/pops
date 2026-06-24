import { z } from 'zod';

import type { ItemUploadedFileRow } from '../../../db/index.js';

export type { ItemUploadedFileRow };

/** API response shape for an item uploaded file. */
export interface ItemUploadedFile {
  id: number;
  itemId: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
  createdAt: string;
}

/** Map a SQLite row to the API response shape. */
export function toUploadedFile(row: ItemUploadedFileRow): ItemUploadedFile {
  return {
    id: row.id,
    itemId: row.itemId,
    fileName: row.fileName,
    filePath: row.filePath,
    mimeType: row.mimeType,
    fileSize: row.fileSize,
    uploadedAt: row.uploadedAt,
    createdAt: row.createdAt,
  };
}

/** Allow PDFs, images, and plain text — same as the UI file picker. */
export const ALLOWED_MIME_PREFIXES = ['application/pdf', 'image/', 'text/'] as const;

/**
 * Hard cap on accepted upload bytes. Direct uploads are stored on the API
 * filesystem; the cap keeps large blobs out of the base64 request payload.
 */
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * Read the maximum file size. The env override (`INVENTORY_MAX_FILE_SIZE_BYTES`)
 * lets a deployment tune the cap without a code change; it falls back to the
 * compiled default when unset or invalid. See
 * docs/themes/foundation/prds/unified-settings for the broader settings story.
 */
export function getMaxFileSizeBytes(): number {
  const raw = process.env['INVENTORY_MAX_FILE_SIZE_BYTES'];
  if (raw === undefined || raw === '') return MAX_FILE_SIZE_BYTES;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return MAX_FILE_SIZE_BYTES;
  return parsed;
}

/**
 * Server-side input for {@link uploadDocument}. The router decodes
 * `fileBase64` to a Buffer before calling.
 */
export interface UploadDocumentInput {
  itemId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}

/** Zod schema validating the upload request body in the REST handler. */
export const UploadDocumentSchema = z.object({
  itemId: z.string().min(1, 'Item ID is required'),
  fileName: z.string().min(1, 'File name is required').max(255, 'File name too long'),
  mimeType: z.string().min(1, 'MIME type is required'),
  /** Base64-encoded file bytes. The router decodes this to a Buffer. */
  fileBase64: z.string().min(1, 'File content is required'),
});
export type UploadDocumentSchemaInput = z.infer<typeof UploadDocumentSchema>;

/** Zod schema for listing uploaded files for an item. */
export const DocumentFileQuerySchema = z.object({
  itemId: z.string().min(1, 'Item ID is required'),
  limit: z.coerce.number().positive().max(500).optional(),
  offset: z.coerce.number().nonnegative().optional(),
});
export type DocumentFileQuery = z.infer<typeof DocumentFileQuerySchema>;
