/**
 * `photos.*` sub-router — per-item photo attach/upload/reorder.
 *
 * Uploads carry the image as a base64 string in the JSON body; the handler
 * decodes to a Buffer and runs the sharp compression pipeline.
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

export const ItemPhotoSchema = z.object({
  id: z.number(),
  itemId: z.string(),
  filePath: z.string(),
  caption: z.string().nullable(),
  sortOrder: z.number(),
  createdAt: z.string(),
});

const PhotoMutation = z.object({ data: ItemPhotoSchema, message: z.string() });

export const inventoryPhotosContract = c.router({
  upload: {
    method: 'POST',
    path: '/items/:itemId/photos',
    pathParams: z.object({ itemId: z.string() }),
    body: z.object({
      fileBase64: z.string().min(1, 'File content is required'),
      caption: z.string().nullable().optional(),
      sortOrder: z.number().int().nonnegative().optional().default(0),
    }),
    responses: { 201: PhotoMutation, ...ERR_RESPONSES },
    summary: 'Upload a photo (base64 JSON body); compressed + stored server-side',
  },
  attach: {
    method: 'POST',
    path: '/items/:itemId/photos/attach',
    pathParams: z.object({ itemId: z.string() }),
    body: z.object({
      filePath: z.string().min(1, 'File path is required'),
      caption: z.string().nullable().optional(),
      sortOrder: z.number().int().nonnegative().optional().default(0),
    }),
    responses: { 201: PhotoMutation, ...ERR_RESPONSES },
    summary: 'Attach a photo by an already-stored relative file path',
  },
  listForItem: {
    method: 'GET',
    path: '/items/:itemId/photos',
    pathParams: z.object({ itemId: z.string() }),
    query: z.object({
      limit: z.coerce.number().positive().max(500).optional(),
      offset: z.coerce.number().nonnegative().optional(),
    }),
    responses: {
      200: z.object({ data: z.array(ItemPhotoSchema), pagination: PaginationMetaSchema }),
    },
    summary: 'List photos for an item',
  },
  reorder: {
    method: 'PATCH',
    path: '/items/:itemId/photos/reorder',
    pathParams: z.object({ itemId: z.string() }),
    body: z.object({
      orderedIds: z.array(z.number().int().positive()).min(1, 'At least one photo ID is required'),
    }),
    responses: {
      200: z.object({ data: z.array(ItemPhotoSchema), message: z.string() }),
      ...ERR_RESPONSES,
    },
    summary: 'Reorder an item’s photos',
  },
  remove: {
    method: 'DELETE',
    path: '/photos/:id',
    pathParams: z.object({ id: PathPositiveInt }),
    body: z.object({}).optional(),
    responses: { 200: MessageSchema, ...ERR_RESPONSES },
    summary: 'Remove a photo (db row + file)',
  },
  update: {
    method: 'PATCH',
    path: '/photos/:id',
    pathParams: z.object({ id: PathPositiveInt }),
    body: z.object({
      caption: z.string().nullable().optional(),
      sortOrder: z.number().int().nonnegative().optional(),
    }),
    responses: { 200: PhotoMutation, ...ERR_RESPONSES },
    summary: 'Update a photo’s caption / sort order',
  },
});
