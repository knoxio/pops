/**
 * `imports.*` sub-router — the statement-import pipeline.
 *
 * Finance-owned (transactions / entities / corrections / tag-rules all live in
 * the finance db). The CSV/PDF transformers are out of scope for this slice:
 * the wire receives already-parsed transactions (`ParsedTransactionSchema`).
 *
 * processImport / executeImport kick off background work and return a
 * `{ sessionId }` immediately; the FE polls `getImportProgress` until the
 * session reports `completed`. The progress store is process-local in-memory
 * state — fine for the single pillar process.
 *
 * The wire shapes live in `rest-imports-schemas.ts`; this file is only the
 * route map + the public type re-exports.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  ApplyChangeSetAndReevaluateInputSchema,
  ApplyChangeSetAndReevaluateOutputSchema,
  CommitPayloadSchema,
  CommitResultSchema,
  CreateEntityInputSchema,
  CreateEntityOutputSchema,
  ExecuteImportInputSchema,
  ImportProgressSchema,
  ProcessImportInputSchema,
  ReevaluateWithPendingRulesInputSchema,
  SessionIdSchema,
} from './rest-imports-schemas.js';
import { ERR_RESPONSES, ERR_RESPONSES_WITH_412 } from './rest-schemas.js';

const c = initContract();

export const financeImportsContract = c.router({
  processImport: {
    method: 'POST',
    path: '/imports/process',
    body: ProcessImportInputSchema,
    responses: { 200: SessionIdSchema, ...ERR_RESPONSES },
    summary: 'Start an import process (dedup + entity matching); returns a session id to poll',
  },
  executeImport: {
    method: 'POST',
    path: '/imports/execute',
    body: ExecuteImportInputSchema,
    responses: { 200: SessionIdSchema, ...ERR_RESPONSES },
    summary: 'Write confirmed transactions to SQLite; returns a session id to poll',
  },
  getImportProgress: {
    method: 'GET',
    path: '/imports/progress',
    query: z.object({ sessionId: z.string().uuid() }),
    responses: { 200: ImportProgressSchema.nullable(), ...ERR_RESPONSES },
    summary: 'Poll an import session for progress (null when the session is unknown/expired)',
  },
  createEntity: {
    method: 'POST',
    path: '/imports/entities',
    body: CreateEntityInputSchema,
    responses: { 200: CreateEntityOutputSchema, ...ERR_RESPONSES },
    summary: 'Create a new entity during an import session',
  },
  applyChangeSetAndReevaluate: {
    method: 'POST',
    path: '/imports/apply-changeset-reevaluate',
    body: ApplyChangeSetAndReevaluateInputSchema,
    responses: { 200: ApplyChangeSetAndReevaluateOutputSchema, ...ERR_RESPONSES_WITH_412 },
    summary: 'Apply a correction ChangeSet atomically, then re-evaluate the import session',
  },
  commitImport: {
    method: 'POST',
    path: '/imports/commit',
    body: CommitPayloadSchema,
    responses: {
      200: z.object({ data: CommitResultSchema, message: z.string() }),
      ...ERR_RESPONSES,
    },
    summary:
      'Atomically create entities, apply changeSets + tag-rule changeSets, write transactions',
  },
  reevaluateWithPendingRules: {
    method: 'POST',
    path: '/imports/reevaluate-pending',
    body: ReevaluateWithPendingRulesInputSchema,
    responses: { 200: ApplyChangeSetAndReevaluateOutputSchema, ...ERR_RESPONSES_WITH_412 },
    summary: 'Re-evaluate the import session against merged (DB + pending) rules; no DB writes',
  },
});
