/**
 * `corrections.*` sub-router — the learned transaction-correction rule surface.
 *
 * This domain is finance-owned (the `transaction_corrections` table lives in
 * the finance db) but is served today from the monolith's `core.corrections.*`
 * tRPC router. The REST shape here is the migration target; only the
 * deterministic CRUD procedures that map directly to
 * `transactionCorrectionsService` are modelled.
 *
 * Deferred (kept in the monolith for now): the ChangeSet propose/preview/
 * apply/revise/reject machinery and the four AI procedures
 * (analyzeCorrection / generateRules / proposal AIs). Those pull in the
 * Anthropic SDK, the changeset-impact engine, and a cross-pillar core.db
 * settings write gated on the C4 REST transport — out of scope for this slice.
 * The ChangeSet zod schemas this file still exports feed the in-pillar
 * imports pipeline (`api/modules/corrections`), not a REST route.
 *
 * tRPC `query` procedures that carry a request body (`findMatch`,
 * `previewMatches`) become `POST` here — a GET cannot carry the body, and a
 * static path also keeps them clear of the `/corrections/:id` param route.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  ERR_RESPONSES,
  LimitQuery,
  MessageSchema,
  OffsetQuery,
  PaginationMetaSchema,
} from './rest-schemas.js';

const c = initContract();

const MatchTypeSchema = z.enum(['exact', 'contains', 'regex']);
const TransactionTypeSchema = z.enum(['purchase', 'transfer', 'income']);

/** Body of a correction `add` op (create-shape + ChangeSet-only confidence/isActive). */
export const CreateCorrectionSchema = z.object({
  descriptionPattern: z.string().min(1),
  matchType: MatchTypeSchema.default('exact'),
  entityId: z.string().nullable().optional(),
  entityName: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  tags: z.array(z.string()).optional().default([]),
  transactionType: TransactionTypeSchema.nullable().optional(),
  priority: z.number().int().nonnegative().optional(),
});

/** Body of a correction `edit` op (all fields optional patch). */
export const UpdateCorrectionSchema = z.object({
  descriptionPattern: z.string().min(1).optional(),
  matchType: MatchTypeSchema.optional(),
  entityId: z.string().nullable().optional(),
  entityName: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  transactionType: TransactionTypeSchema.nullable().optional(),
  isActive: z.boolean().optional(),
  confidence: z.number().min(0).max(1).optional(),
  priority: z.number().int().nonnegative().optional(),
});

const CorrectionRuleDataSchema = CreateCorrectionSchema.extend({
  confidence: z.number().min(0).max(1).optional(),
  isActive: z.boolean().optional(),
});

export const ChangeSetOpSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('add'), data: CorrectionRuleDataSchema }),
  z.object({ op: z.literal('edit'), id: z.string().min(1), data: UpdateCorrectionSchema }),
  z.object({ op: z.literal('disable'), id: z.string().min(1) }),
  z.object({ op: z.literal('remove'), id: z.string().min(1) }),
]);

export const ChangeSetSchema = z.object({
  source: z.string().optional(),
  reason: z.string().optional(),
  ops: z.array(ChangeSetOpSchema).min(1),
});

export type ChangeSetOp = z.infer<typeof ChangeSetOpSchema>;
export type ChangeSet = z.infer<typeof ChangeSetSchema>;

/**
 * Persisted correction row as served by the handlers (`toCorrection`): `tags`
 * is parsed to a `string[]` (the column stores JSON), `isActive` is a real
 * boolean. Mirrors the monolith `Correction` projection.
 */
export const CorrectionSchema = z.object({
  id: z.string(),
  descriptionPattern: z.string(),
  matchType: MatchTypeSchema,
  entityId: z.string().nullable(),
  entityName: z.string().nullable(),
  location: z.string().nullable(),
  tags: z.array(z.string()),
  transactionType: TransactionTypeSchema.nullable(),
  isActive: z.boolean(),
  priority: z.number(),
  confidence: z.number(),
  timesApplied: z.number(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
});

const CorrectionMutation = z.object({ data: CorrectionSchema, message: z.string() });

const CorrectionListQuery = z.object({
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  matchType: MatchTypeSchema.optional(),
  limit: LimitQuery,
  offset: OffsetQuery,
});

const FindMatchBody = z.object({
  description: z.string().min(1),
  minConfidence: z.number().min(0).max(1).default(0.7),
});

const FindMatchResult = z.object({
  data: CorrectionSchema.nullable(),
  status: z.enum(['matched', 'uncertain']).nullable(),
});

const PreviewMatchesBody = z.object({
  descriptionPattern: z.string().min(1),
  matchType: MatchTypeSchema,
  limit: z.number().int().positive().max(200).optional(),
});

/** A transaction row a candidate rule would match, with `tags` parsed to a `string[]`. */
const PreviewMatchTransactionSchema = z.object({
  id: z.string(),
  description: z.string(),
  account: z.string(),
  amount: z.number(),
  date: z.string(),
  entityName: z.string().nullable(),
  tags: z.array(z.string()),
});

const PreviewMatchResultSchema = z.object({
  matches: z.array(PreviewMatchTransactionSchema),
  total: z.number(),
  scanned: z.number(),
  truncated: z.boolean(),
});

export const financeCorrectionsContract = c.router({
  list: {
    method: 'GET',
    path: '/corrections',
    query: CorrectionListQuery,
    responses: {
      200: z.object({ data: z.array(CorrectionSchema), pagination: PaginationMetaSchema }),
      ...ERR_RESPONSES,
    },
    summary: 'List corrections with optional minConfidence / matchType filters and pagination',
  },
  findMatch: {
    method: 'POST',
    path: '/corrections/find-match',
    body: FindMatchBody,
    responses: { 200: FindMatchResult, ...ERR_RESPONSES },
    summary: 'Find the winning correction for a description (null when none match)',
  },
  previewMatches: {
    method: 'POST',
    path: '/corrections/preview-matches',
    body: PreviewMatchesBody,
    responses: { 200: z.object({ data: PreviewMatchResultSchema }), ...ERR_RESPONSES },
    summary: 'Preview the transactions a candidate (pattern, matchType) rule would match',
  },
  get: {
    method: 'GET',
    path: '/corrections/:id',
    pathParams: z.object({ id: z.string() }),
    responses: { 200: z.object({ data: CorrectionSchema }), ...ERR_RESPONSES },
    summary: 'Get a single correction by id',
  },
  createOrUpdate: {
    method: 'POST',
    path: '/corrections',
    body: CreateCorrectionSchema,
    responses: { 200: CorrectionMutation, ...ERR_RESPONSES },
    summary: 'Create a correction, or reinforce an existing one keyed on (pattern, matchType)',
  },
  update: {
    method: 'PATCH',
    path: '/corrections/:id',
    pathParams: z.object({ id: z.string() }),
    body: UpdateCorrectionSchema,
    responses: { 200: CorrectionMutation, ...ERR_RESPONSES },
    summary: 'Update a correction',
  },
  delete: {
    method: 'DELETE',
    path: '/corrections/:id',
    pathParams: z.object({ id: z.string() }),
    body: z.object({}).optional(),
    responses: { 200: MessageSchema, ...ERR_RESPONSES },
    summary: 'Delete a correction',
  },
  adjustConfidence: {
    method: 'POST',
    path: '/corrections/:id/adjust-confidence',
    pathParams: z.object({ id: z.string() }),
    body: z.object({ delta: z.number().min(-1).max(1) }),
    responses: { 200: MessageSchema, ...ERR_RESPONSES },
    summary: 'Nudge a correction confidence by delta (deletes the row when it drops below 0.3)',
  },
});
