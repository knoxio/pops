/**
 * `corrections.*` sub-router — the learned transaction-correction rule surface.
 *
 * Finance-owned (the `transaction_corrections` table lives in the finance db).
 * Serves the deterministic CRUD + the ChangeSet preview/apply/merged-list
 * surface. Deferred (kept in the monolith for now): the AI procedures
 * (analyzeCorrection / generateRules / propose / revise / reject) — they pull
 * in the Anthropic SDK and a cross-pillar core.db settings write.
 *
 * tRPC `query` procedures that carry a request body (`findMatch`,
 * `previewMatches`, `listMerged`, `previewChangeSet`) become `POST` here — a GET
 * cannot carry the body, and static paths keep them clear of `/corrections/:id`.
 *
 * Schemas live in `rest-corrections-schemas.ts`; the ChangeSet schemas are
 * re-exported here because the in-pillar imports pipeline imports them from
 * this path.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  ChangeSetPreviewDiffSchema,
  ChangeSetPreviewSummarySchema,
  ChangeSetSchema,
  CorrectionListQuery,
  CorrectionMutation,
  CorrectionSchema,
  CreateCorrectionSchema,
  FindMatchBody,
  FindMatchResult,
  ListMergedBody,
  PreviewChangeSetBody,
  PreviewMatchesBody,
  PreviewMatchResultSchema,
  UpdateCorrectionSchema,
} from './rest-corrections-schemas.js';
import { ERR_RESPONSES, MessageSchema, PaginationMetaSchema } from './rest-schemas.js';

export {
  ChangeSetOpSchema,
  ChangeSetSchema,
  CreateCorrectionSchema,
  UpdateCorrectionSchema,
  type ChangeSet,
  type ChangeSetOp,
} from './rest-corrections-schemas.js';

const c = initContract();

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
  listMerged: {
    method: 'POST',
    path: '/corrections/list-merged',
    body: ListMergedBody,
    responses: {
      200: z.object({ data: z.array(CorrectionSchema), pagination: PaginationMetaSchema }),
      ...ERR_RESPONSES,
    },
    summary:
      'List corrections with pending (un-persisted) ChangeSets folded in (temp: rows included), paginated',
  },
  previewChangeSet: {
    method: 'POST',
    path: '/corrections/preview-changeset',
    body: PreviewChangeSetBody,
    responses: {
      200: z.object({
        diffs: z.array(ChangeSetPreviewDiffSchema),
        summary: ChangeSetPreviewSummarySchema,
      }),
      ...ERR_RESPONSES,
    },
    summary:
      'Preview the before/after match impact of a ChangeSet against caller-supplied transactions',
  },
  applyChangeSet: {
    method: 'POST',
    path: '/corrections/apply-changeset',
    body: z.object({ changeSet: ChangeSetSchema }),
    responses: {
      200: z.object({ data: z.array(CorrectionSchema), message: z.string() }),
      ...ERR_RESPONSES,
    },
    summary: 'Apply a correction-rule ChangeSet atomically; returns the full rule set',
  },
});
