/**
 * `documents.*` sub-router — link/unlink Paperless-ngx documents to items.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  DOCUMENT_TYPE_ENUM,
  ERR_RESPONSES,
  MessageSchema,
  PaginationMetaSchema,
  PathPositiveInt,
} from './rest-schemas.js';

const c = initContract();

export const ItemDocumentSchema = z.object({
  id: z.number(),
  itemId: z.string(),
  paperlessDocumentId: z.number(),
  documentType: z.string(),
  title: z.string().nullable(),
  createdAt: z.string(),
});

export const inventoryDocumentsContract = c.router({
  link: {
    method: 'POST',
    path: '/items/:itemId/documents',
    pathParams: z.object({ itemId: z.string() }),
    body: z.object({
      paperlessDocumentId: z.number().int().positive('Document ID must be a positive integer'),
      documentType: DOCUMENT_TYPE_ENUM,
      title: z.string().optional(),
    }),
    responses: {
      201: z.object({ data: ItemDocumentSchema, message: z.string() }),
      ...ERR_RESPONSES,
    },
    summary: 'Link a Paperless document to an item',
  },
  unlink: {
    method: 'DELETE',
    path: '/documents/:id',
    pathParams: z.object({ id: PathPositiveInt }),
    body: z.object({}).optional(),
    responses: { 200: MessageSchema, ...ERR_RESPONSES },
    summary: 'Unlink a document by link id',
  },
  listForItem: {
    method: 'GET',
    path: '/items/:itemId/documents',
    pathParams: z.object({ itemId: z.string() }),
    query: z.object({
      limit: z.coerce.number().positive().max(500).optional(),
      offset: z.coerce.number().nonnegative().optional(),
    }),
    responses: {
      200: z.object({ data: z.array(ItemDocumentSchema), pagination: PaginationMetaSchema }),
    },
    summary: 'List documents linked to an item',
  },
});
