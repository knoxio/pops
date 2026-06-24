/**
 * `documentFiles.*` sub-router — direct (non-Paperless) file uploads.
 *
 * Uploads carry the file as a base64 string in the JSON body. The handler
 * decodes to a Buffer and validates MIME + size before writing to disk.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  ERR_RESPONSES,
  MessageSchema,
  PaginationMetaSchema,
  PathPositiveInt,
} from './rest-schemas.js';

const c = initContract();

export const ItemUploadedFileSchema = z.object({
  id: z.number(),
  itemId: z.string(),
  fileName: z.string(),
  filePath: z.string(),
  mimeType: z.string(),
  fileSize: z.number(),
  uploadedAt: z.string(),
  createdAt: z.string(),
});

export const inventoryDocumentFilesContract = c.router({
  upload: {
    method: 'POST',
    path: '/items/:itemId/uploads',
    pathParams: z.object({ itemId: z.string() }),
    body: z.object({
      fileName: z.string().min(1, 'File name is required').max(255, 'File name too long'),
      mimeType: z.string().min(1, 'MIME type is required'),
      fileBase64: z.string().min(1, 'File content is required'),
    }),
    responses: {
      201: z.object({ data: ItemUploadedFileSchema, message: z.string() }),
      ...ERR_RESPONSES,
    },
    summary: 'Upload a document file (base64 JSON body); validated + stored server-side',
  },
  removeUpload: {
    method: 'DELETE',
    path: '/uploads/:id',
    pathParams: z.object({ id: PathPositiveInt }),
    body: z.object({}).optional(),
    responses: { 200: MessageSchema, ...ERR_RESPONSES },
    summary: 'Remove an uploaded file (db row + file)',
  },
  listForItem: {
    method: 'GET',
    path: '/items/:itemId/uploads',
    pathParams: z.object({ itemId: z.string() }),
    query: z.object({
      limit: z.coerce.number().positive().max(500).optional(),
      offset: z.coerce.number().nonnegative().optional(),
    }),
    responses: {
      200: z.object({ data: z.array(ItemUploadedFileSchema), pagination: PaginationMetaSchema }),
    },
    summary: 'List uploaded files for an item',
  },
});
