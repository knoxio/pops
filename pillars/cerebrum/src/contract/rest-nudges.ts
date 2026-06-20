/**
 * ts-rest contract for `cerebrum.nudges.*` (PRD-084).
 *
 * Nudges are detector-produced suggestions persisted in `nudge_log`. This
 * slice migrates ONLY the clean read/dismiss surface — the four procedures
 * that touch nothing but the `nudge_log` table:
 *
 *   - `list`           → POST /nudges/search (typed enum filters)
 *   - `get`            → GET  /nudges/:id
 *   - `dismiss`        → POST /nudges/:id/dismiss
 *   - `contradictions` → POST /nudges/contradictions
 *
 * The write surface completes the domain:
 *
 *   - `create`    → POST /nudges            (alert-driven single insert, no dedup)
 *   - `scan`      → POST /nudges/scan       (runs detectors, persists nudges)
 *   - `act`       → POST /nudges/:id/act    (executes the suggested action)
 *   - `configure` → POST /nudges/configure  (updates detection thresholds)
 *
 * `scan` drives the consolidation / staleness / pattern detectors over the
 * active engram corpus (reusing the in-pillar retrieval + engrams services and
 * an injectable contradiction LLM); `act` runs the nudge's action through the
 * EngramService; `configure` mutates the in-process thresholds (see the
 * write-service JSDoc for the non-persistence deviation).
 *
 * Non-identity domain — served on the docker-network trust boundary with no
 * per-request auth (parity with templates / engrams). `list` /
 * `contradictions` are POST-with-body rather than GET because their typed
 * enum filters don't round-trip cleanly through a query string (mirrors the
 * reflex `history` + engrams `search` precedent).
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { errorBodySchema } from './rest-schemas.js';

const c = initContract();

/**
 * Nudge wire schemas. The pillar contract is self-contained, so the Nudge
 * shape is defined here rather than imported from the db package. They live
 * with the nudges contract (rather than in shared `rest-schemas.ts`) because
 * no other domain consumes them.
 */
export const nudgeTypeSchema = z.enum(['consolidation', 'staleness', 'pattern', 'insight']);
export type NudgeTypeWire = z.infer<typeof nudgeTypeSchema>;

export const nudgeStatusSchema = z.enum(['pending', 'dismissed', 'acted', 'expired']);
export type NudgeStatusWire = z.infer<typeof nudgeStatusSchema>;

export const nudgePrioritySchema = z.enum(['low', 'medium', 'high']);
export type NudgePriorityWire = z.infer<typeof nudgePrioritySchema>;

export const nudgeActionSchema = z.object({
  type: z.enum(['consolidate', 'archive', 'review', 'link']),
  label: z.string(),
  params: z.record(z.string(), z.unknown()),
});

/** A persisted nudge — the core data model of PRD-084. */
export const nudgeSchema = z.object({
  id: z.string(),
  type: nudgeTypeSchema,
  title: z.string(),
  body: z.string(),
  engramIds: z.array(z.string()),
  priority: nudgePrioritySchema,
  status: nudgeStatusSchema,
  createdAt: z.string(),
  expiresAt: z.string().nullable(),
  actedAt: z.string().nullable(),
  action: nudgeActionSchema.nullable(),
});
export type NudgeWire = z.infer<typeof nudgeSchema>;

/** A contradiction-pattern nudge projected to its structured evidence. */
export const nudgeContradictionSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  status: nudgeStatusSchema,
  priority: nudgePrioritySchema,
  title: z.string(),
  engramA: z.string(),
  engramB: z.string(),
  excerptA: z.string(),
  excerptB: z.string(),
  conflict: z.string(),
});
export type NudgeContradictionWire = z.infer<typeof nudgeContradictionSchema>;

const idParams = z.object({ id: z.string().min(1) });

/** Detection thresholds patch — every field optional (parity with the monolith). */
export const nudgeConfigureSchema = z.object({
  consolidationSimilarity: z.number().min(0).max(1).optional(),
  consolidationMinCluster: z.number().int().positive().optional(),
  stalenessDays: z.number().int().positive().optional(),
  patternMinOccurrences: z.number().int().positive().optional(),
  maxPendingNudges: z.number().int().positive().optional(),
  nudgeCooldownHours: z.number().positive().optional(),
});
export type NudgeConfigureWire = z.infer<typeof nudgeConfigureSchema>;

export const cerebrumNudgesContract = c.router({
  create: {
    method: 'POST',
    path: '/nudges',
    summary: 'Create a single nudge (alert-driven; no cooldown dedup).',
    body: z.object({
      type: nudgeTypeSchema.optional(),
      title: z.string(),
      body: z.string(),
      priority: nudgePrioritySchema,
      engramIds: z.array(z.string()).optional(),
      expiresAt: z.string().nullable().optional(),
      action: nudgeActionSchema.nullable().optional(),
    }),
    responses: {
      200: z.object({ nudge: nudgeSchema }),
    },
  },
  list: {
    method: 'POST',
    path: '/nudges/search',
    summary: 'List nudges matching the supplied filters, with a total count.',
    body: z.object({
      type: nudgeTypeSchema.optional(),
      status: nudgeStatusSchema.optional(),
      priority: nudgePrioritySchema.optional(),
      limit: z.number().int().positive().max(100).optional(),
      offset: z.number().int().nonnegative().optional(),
    }),
    responses: {
      200: z.object({ nudges: z.array(nudgeSchema), total: z.number().int() }),
    },
  },
  get: {
    method: 'GET',
    path: '/nudges/:id',
    summary: 'Get a single nudge by ID.',
    pathParams: idParams,
    responses: {
      200: z.object({ nudge: nudgeSchema }),
      404: errorBodySchema,
    },
  },
  dismiss: {
    method: 'POST',
    path: '/nudges/:id/dismiss',
    summary: 'Dismiss a pending nudge.',
    pathParams: idParams,
    body: z.object({}),
    responses: {
      200: z.object({ success: z.boolean() }),
      404: errorBodySchema,
      409: errorBodySchema,
    },
  },
  contradictions: {
    method: 'POST',
    path: '/nudges/contradictions',
    summary: 'List contradiction-pattern nudges with structured evidence.',
    body: z.object({
      status: nudgeStatusSchema.nullable().optional(),
      limit: z.number().int().positive().max(100).optional(),
      offset: z.number().int().nonnegative().optional(),
    }),
    responses: {
      200: z.object({
        contradictions: z.array(nudgeContradictionSchema),
        total: z.number().int(),
      }),
    },
  },
  scan: {
    method: 'POST',
    path: '/nudges/scan',
    summary: 'Run the nudge detectors over the active engram corpus.',
    body: z.object({ type: nudgeTypeSchema.optional() }),
    responses: {
      200: z.object({ created: z.number().int() }),
    },
  },
  act: {
    method: 'POST',
    path: '/nudges/:id/act',
    summary: 'Act on a pending nudge — execute its suggested action.',
    pathParams: idParams,
    body: z.object({}),
    responses: {
      200: z.object({
        result: z.object({ success: z.boolean(), nudge: nudgeSchema.nullable() }),
      }),
      404: errorBodySchema,
      409: errorBodySchema,
    },
  },
  configure: {
    method: 'POST',
    path: '/nudges/configure',
    summary: 'Update the in-process nudge detection thresholds.',
    body: nudgeConfigureSchema,
    responses: {
      200: z.object({ success: z.boolean() }),
    },
  },
});
