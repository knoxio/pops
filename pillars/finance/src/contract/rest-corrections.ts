/**
 * `corrections.*` sub-router — the learned transaction-correction rule surface.
 * The `transaction_corrections` table lives in the finance db. Serves the
 * deterministic CRUD + the ChangeSet preview/apply/merged-list surface, plus
 * the AI cluster (analyze / generate-rules / propose / revise / reject) —
 * Anthropic via the finance env key; rejection-feedback + AI config reached
 * over the registry settings server SDK, best-effort.
 *
 * Read endpoints that carry a request body (`findMatch`, `previewMatches`,
 * `listMerged`, `previewChangeSet`) are `POST`: a GET cannot carry the body,
 * and their static paths keep them clear of `/corrections/:id`.
 *
 * Schemas live in `rest-corrections-schemas.ts`; the ChangeSet schemas are
 * re-exported here because the in-pillar imports pipeline imports them from
 * this path.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  AnalyzeCorrectionBody,
  ChangeSetProposalSchema,
  CorrectionAnalysisSchema,
  GenerateRulesBody,
  ProposedRuleSchema,
  ProposeChangeSetBody,
  RejectChangeSetBody,
  ReviseChangeSetBody,
  ReviseResultSchema,
} from './rest-corrections-ai-schemas.js';
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
  analyzeCorrection: {
    method: 'POST',
    path: '/corrections/analyze',
    body: AnalyzeCorrectionBody,
    responses: {
      200: z.object({ data: CorrectionAnalysisSchema.nullable() }),
      ...ERR_RESPONSES,
    },
    summary:
      'AI-derive a reusable rule (matchType/pattern/confidence) from one labelled transaction',
  },
  generateRules: {
    method: 'POST',
    path: '/corrections/generate-rules',
    body: GenerateRulesBody,
    responses: { 200: z.object({ proposals: z.array(ProposedRuleSchema) }), ...ERR_RESPONSES },
    summary: 'AI-propose reusable tagging rules from a batch of transactions',
  },
  proposeChangeSet: {
    method: 'POST',
    path: '/corrections/propose-changeset',
    body: ProposeChangeSetBody,
    responses: { 200: ChangeSetProposalSchema, ...ERR_RESPONSES },
    summary: 'Propose an add/edit ChangeSet for a correction signal (adapts to prior rejections)',
  },
  reviseChangeSet: {
    method: 'POST',
    path: '/corrections/revise-changeset',
    body: ReviseChangeSetBody,
    responses: { 200: ReviseResultSchema, ...ERR_RESPONSES },
    summary: 'AI-revise an in-progress ChangeSet from a free-text instruction',
  },
  rejectChangeSet: {
    method: 'POST',
    path: '/corrections/reject-changeset',
    body: RejectChangeSetBody,
    responses: { 200: MessageSchema, ...ERR_RESPONSES },
    summary: 'Record rejection feedback for a ChangeSet (best-effort; feeds the next proposal)',
  },
});
