/**
 * Handler for `POST /ai-usage/record` — the cross-pillar telemetry sink.
 *
 * Best-effort, always returns `200 { ok: true }` even when the insert throws
 * (a slow/broken sink must never fail a Claude call upstream). Does ONLY
 * `createInferenceLog` — NEVER `recordInferenceDaily` (the daily rollup is a
 * batch aggregator over aged rows, owned by the observability scheduler; a
 * per-record call would be a type error and semantically wrong).
 *
 * Field → column mapping (no column renames): `cached(bool)→0|1`,
 * `promptVersion→metadata.prompt_version`, `contextId→context_id`,
 * `errorMessage→error_message`. The merged `metadata` JSON is capped
 * defensively (~4 KB) to block accidental prompt dumping.
 *
 * `domain` is validated to a low-cardinality, whitespace-free token before the
 * write so a typo'd caller fails loudly (400) rather than silently polluting the
 * federation-wide log. (The zod body already guarantees `min(1)`; this adds the
 * PII/cardinality guard the plan calls for without pulling the heavy
 * module-registry build into the pillar image.)
 */
import { aiUsageService, type AiDb } from '../../db/index.js';
import { ValidationError } from '../shared/errors.js';
import { logger } from '../shared/logger.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { aiIngestContract } from '../../contract/rest-ingest.js';

type Req = ServerInferRequest<typeof aiIngestContract>;

/** Max serialized `metadata` length (bytes) persisted; longer payloads are dropped. */
const METADATA_JSON_CAP = 4096;

/** A caller pillar id / domain token: lowercase, no whitespace, bounded. */
const DOMAIN_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

function capJson(value: unknown): string | null {
  if (value === undefined) return null;
  const json = JSON.stringify(value);
  if (json === undefined) return null;
  if (json.length > METADATA_JSON_CAP) return null;
  return json;
}

export function makeIngestHandler(db: AiDb) {
  return {
    record: ({ body }: Req['record']) =>
      runHttp(() => {
        if (!DOMAIN_PATTERN.test(body.domain)) {
          throw new ValidationError({ field: 'domain', reason: 'unknown or malformed domain' });
        }

        const merged: Record<string, unknown> = { ...body.metadata };
        if (body.promptVersion !== undefined) merged['prompt_version'] = body.promptVersion;
        const metadataJson = Object.keys(merged).length > 0 ? capJson(merged) : null;

        try {
          aiUsageService.createInferenceLog(db, {
            provider: body.provider,
            model: body.model,
            operation: body.operation,
            domain: body.domain,
            inputTokens: body.inputTokens,
            outputTokens: body.outputTokens,
            costUsd: body.costUsd,
            latencyMs: body.latencyMs,
            status: body.status,
            cached: body.cached ? 1 : 0,
            contextId: body.contextId ?? null,
            errorMessage: body.errorMessage ?? null,
            metadata: metadataJson,
          });
        } catch (err) {
          logger.warn({ err }, '[ai.record] inference-log insert failed (best-effort)');
        }

        return { status: 200 as const, body: { ok: true as const } };
      }),
  };
}
