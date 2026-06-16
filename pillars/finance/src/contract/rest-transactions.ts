/**
 * `transactions.*` sub-router — transaction CRUD plus the delete/restore
 * (Undo) handshake.
 *
 * Response/body schemas mirror the legacy `finance.transactions.*` tRPC
 * wire shapes (`toTransaction` + the create/update/snapshot zod inputs).
 * Only the 6-procedure CRUD slice is migrated — `suggestTags`,
 * `listDescriptionsForPreview`, and `availableTags` stay in the monolith
 * until their cross-pillar surfaces (tag-suggester / core-corrections)
 * move into the pillar.
 *
 * `restore` is `POST /transactions/restore` (a literal segment) so it does
 * not collide with the `:id` param routes.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ERR_RESPONSES, LimitQuery, OffsetQuery } from './rest-schemas.js';

const c = initContract();

/** Wire shape served by the transaction handlers (`toTransaction`). */
export const TransactionSchema = z.object({
  id: z.string(),
  description: z.string(),
  account: z.string(),
  amount: z.number(),
  date: z.string(),
  type: z.string(),
  tags: z.array(z.string()),
  entityId: z.string().nullable(),
  entityName: z.string().nullable(),
  location: z.string().nullable(),
  country: z.string().nullable(),
  relatedTransactionId: z.string().nullable(),
  notes: z.string().nullable(),
  lastEditedTime: z.string(),
});

/**
 * Full SQLite row snapshot returned by `delete` and accepted by `restore`
 * — preserves the original id, dedup metadata (`checksum`, `rawRow`),
 * and `notionId` so an Undo restores everything a re-import would dedupe
 * against. `tags` is the raw JSON string here (not the parsed array).
 */
export const TransactionSnapshotSchema = z.object({
  id: z.string(),
  notionId: z.string().nullable(),
  description: z.string(),
  account: z.string(),
  amount: z.number(),
  date: z.string(),
  type: z.string(),
  tags: z.string(),
  entityId: z.string().nullable(),
  entityName: z.string().nullable(),
  location: z.string().nullable(),
  country: z.string().nullable(),
  relatedTransactionId: z.string().nullable(),
  notes: z.string().nullable(),
  checksum: z.string().nullable(),
  rawRow: z.string().nullable(),
  lastEditedTime: z.string(),
});

const CreateTransactionBody = z.object({
  description: z.string().min(1, 'Description is required'),
  account: z.string().min(1, 'Account is required'),
  amount: z.number(),
  date: z.string().min(1, 'Date is required'),
  type: z.string().min(1, 'Type is required'),
  tags: z.array(z.string()).optional().default([]),
  entityId: z.string().nullable().optional(),
  entityName: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  relatedTransactionId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  rawRow: z.string().optional(),
  checksum: z.string().optional(),
});

const UpdateTransactionBody = z.object({
  description: z.string().min(1, 'Description cannot be empty').optional(),
  account: z.string().min(1, 'Account cannot be empty').optional(),
  amount: z.number().optional(),
  date: z.string().min(1, 'Date cannot be empty').optional(),
  type: z.string().optional(),
  tags: z.array(z.string()).optional(),
  entityId: z.string().nullable().optional(),
  entityName: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  relatedTransactionId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const TransactionQuery = z.object({
  search: z.string().optional(),
  account: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  tag: z.string().optional(),
  entityId: z.string().optional(),
  type: z.string().optional(),
  limit: LimitQuery,
  offset: OffsetQuery,
});

export const financeTransactionsContract = c.router({
  list: {
    method: 'GET',
    path: '/transactions',
    query: TransactionQuery,
    responses: {
      200: z.object({
        data: z.array(TransactionSchema),
        pagination: z.object({
          total: z.number(),
          limit: z.number(),
          offset: z.number(),
          hasMore: z.boolean(),
        }),
      }),
    },
    summary: 'List transactions with optional filters and pagination',
  },
  // Literal sub-paths declared BEFORE `:id` so they are never shadowed by the param route.
  suggestTags: {
    method: 'GET',
    path: '/transactions/suggest-tags',
    query: z.object({ description: z.string(), entityId: z.string().optional() }),
    responses: { 200: z.object({ tags: z.array(z.string()) }) },
    summary: 'Rule-based tag suggestions for a description/entity (no LLM call)',
  },
  descriptionsForPreview: {
    method: 'GET',
    path: '/transactions/descriptions-preview',
    query: z.object({
      limit: z.coerce.number().int().positive().max(2000).optional(),
    }),
    responses: {
      200: z.object({
        data: z.array(z.object({ description: z.string(), checksum: z.string().nullable() })),
        total: z.number(),
        truncated: z.boolean(),
      }),
    },
    summary: 'Descriptions (+ checksums) of existing transactions for client-side rule preview',
  },
  availableTags: {
    method: 'GET',
    path: '/transactions/available-tags',
    responses: { 200: z.object({ tags: z.array(z.string()) }) },
    summary: 'Distinct tag values across all transactions (autocomplete)',
  },
  get: {
    method: 'GET',
    path: '/transactions/:id',
    pathParams: z.object({ id: z.string() }),
    responses: { 200: z.object({ data: TransactionSchema }), ...ERR_RESPONSES },
    summary: 'Get a single transaction',
  },
  create: {
    method: 'POST',
    path: '/transactions',
    body: CreateTransactionBody,
    responses: {
      201: z.object({ data: TransactionSchema, message: z.string() }),
      ...ERR_RESPONSES,
    },
    summary: 'Create a transaction',
  },
  update: {
    method: 'PATCH',
    path: '/transactions/:id',
    pathParams: z.object({ id: z.string() }),
    body: UpdateTransactionBody,
    responses: {
      200: z.object({ data: TransactionSchema, message: z.string() }),
      ...ERR_RESPONSES,
    },
    summary: 'Update a transaction',
  },
  delete: {
    method: 'DELETE',
    path: '/transactions/:id',
    pathParams: z.object({ id: z.string() }),
    body: z.object({}).optional(),
    responses: {
      200: z.object({ message: z.string(), snapshot: TransactionSnapshotSchema }),
      ...ERR_RESPONSES,
    },
    summary: 'Delete a transaction; returns a snapshot for Undo via restore',
  },
  restore: {
    method: 'POST',
    path: '/transactions/restore',
    body: TransactionSnapshotSchema,
    responses: {
      201: z.object({ data: TransactionSchema, message: z.string() }),
      ...ERR_RESPONSES,
    },
    summary: 'Restore a previously-deleted transaction from its snapshot',
  },
});
