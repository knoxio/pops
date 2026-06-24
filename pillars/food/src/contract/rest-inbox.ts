/**
 * `inbox.*` sub-router — recipe-ingest triage. Pure DB reads/writes.
 * Mutations + inspector return the service's discriminated `{ ok, ... }`
 * result on 200. List endpoints are POST-with-body (array filters +
 * cursor). `getForReview.review` is fully modelled in
 * `rest-inbox-review-schemas.ts` so the generated api-types describe the
 * wire shape.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { InspectorReviewViewSchema } from './rest-inbox-review-schemas.js';
import {
  ApproveResult,
  DraftSort,
  DraftsPage,
  FailedPage,
  IngestKind,
  PartialReason,
  QualityBand,
  RejectResult,
  RejectedPage,
  RejectionReason,
  SinceDays,
  UnrejectResult,
} from './rest-inbox-schemas.js';
import { ERR_RESPONSES, QueryPositiveInt } from './rest-schemas.js';

const c = initContract();

export const foodInboxContract = c.router({
  approve: {
    method: 'POST',
    path: '/inbox/approve',
    body: z.object({ versionId: z.number().int().positive() }),
    responses: { 200: ApproveResult },
    summary: 'Approve (promote) an ingest draft version',
  },
  reject: {
    method: 'POST',
    path: '/inbox/reject',
    body: z.object({
      versionId: z.number().int().positive(),
      reason: RejectionReason,
      note: z.string().nullish(),
    }),
    responses: { 200: RejectResult },
    summary: 'Reject an ingest draft version',
  },
  unreject: {
    method: 'POST',
    path: '/inbox/unreject',
    body: z.object({ versionId: z.number().int().positive() }),
    responses: { 200: UnrejectResult },
    summary: 'Restore a rejected draft back to draft',
  },
  list: {
    method: 'POST',
    path: '/inbox/list',
    body: z.object({
      bands: z.array(QualityBand).optional(),
      kinds: z.array(IngestKind).optional(),
      partialReasons: z.array(PartialReason).optional(),
      freshOnly: z.boolean().optional(),
      sort: DraftSort.optional(),
      cursor: z.string().optional(),
      limit: z.number().int().positive().max(100).optional(),
    }),
    responses: { 200: DraftsPage },
    summary: 'List ingest drafts (scored + paginated)',
  },
  listRejected: {
    method: 'POST',
    path: '/inbox/rejected',
    body: z.object({
      reasons: z.array(RejectionReason).optional(),
      kinds: z.array(IngestKind).optional(),
      sinceDays: SinceDays.nullish(),
      cursor: z.string().optional(),
      limit: z.number().int().positive().max(100).optional(),
    }),
    responses: { 200: RejectedPage },
    summary: 'List rejected draft versions',
  },
  listFailed: {
    method: 'POST',
    path: '/inbox/failed',
    body: z.object({
      errorCodes: z.array(z.string()).optional(),
      kinds: z.array(IngestKind).optional(),
      sinceDays: SinceDays.nullish(),
      cursor: z.string().optional(),
      limit: z.number().int().positive().max(100).optional(),
    }),
    responses: { 200: FailedPage },
    summary: 'List failed ingest sources',
  },
  failedErrorCodes: {
    method: 'GET',
    path: '/inbox/failed/error-codes',
    responses: { 200: z.object({ items: z.array(z.string()) }) },
    summary: 'Distinct error codes across failed ingests',
  },
  pendingCount: {
    method: 'GET',
    path: '/inbox/pending-count',
    responses: { 200: z.object({ count: z.number().int() }) },
    summary: 'Unfiltered pending-draft queue depth',
  },
  getForReview: {
    method: 'GET',
    path: '/inbox/review',
    query: z.object({ sourceId: QueryPositiveInt }),
    responses: {
      200: z.discriminatedUnion('ok', [
        z.object({ ok: z.literal(true), review: InspectorReviewViewSchema }),
        z.object({ ok: z.literal(false), reason: z.literal('SourceNotFound') }),
      ]),
      ...ERR_RESPONSES,
    },
    summary: 'Per-draft inspector view (source + draft aggregate)',
  },
});
