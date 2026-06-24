/**
 * Raw HTTP client for posting worker results back to the food pillar's API.
 *
 * Single-purpose fetch against the ts-rest `ingest.workerComplete` endpoint
 * (`POST /ingest/worker-complete`) with a plain-JSON body. `apiUrl` points at
 * the food API container's base URL.
 *
 * The auth header (`x-pops-internal-token`) is validated by the
 * `requireInternalToken` middleware in `pillars/food/src/api/app.ts`, which
 * gates `/ingest/worker-complete` on `POPS_API_INTERNAL_TOKEN`.
 */
import type { IngestJobResult } from '../contract/queue/index.js';

export interface ApiClient {
  readonly apiUrl: string;
  readonly internalToken: string;
}

export function createApiClient(opts: { apiUrl: string; internalToken: string }): ApiClient {
  return { apiUrl: opts.apiUrl.replace(/\/+$/, ''), internalToken: opts.internalToken };
}

type WireMeta = {
  extractor_version: string;
  stages: Record<string, unknown>;
  [k: string]: unknown;
};

/**
 * The contract's `MetaSchema` is a zod `.passthrough()`, so the inferred
 * input adds a `[k: string]: unknown` index signature that `IngestMeta`'s
 * interface lacks. `toWireMeta` rebuilds it as a plain record so the shapes
 * line up without weakening the contract type.
 */
function toWireMeta(meta: IngestJobResult['meta']): WireMeta {
  return { ...meta, extractor_version: meta.extractor_version, stages: meta.stages };
}

interface WorkerCompleteOk {
  readonly sourceId: number;
  readonly ok: true;
  readonly dsl: string;
  readonly meta: WireMeta;
  readonly partialReason?: string;
}

interface WorkerCompleteErr {
  readonly sourceId: number;
  readonly ok: false;
  readonly errorCode: string;
  readonly errorMessage: string;
  readonly meta: WireMeta;
}

type WorkerCompleteInput = WorkerCompleteOk | WorkerCompleteErr;

function buildInput(sourceId: number, result: IngestJobResult): WorkerCompleteInput {
  if (result.ok) {
    const base: WorkerCompleteOk = {
      sourceId,
      ok: true,
      dsl: result.dsl,
      meta: toWireMeta(result.meta),
    };
    return result.partialReason !== undefined
      ? { ...base, partialReason: result.partialReason }
      : base;
  }
  return {
    sourceId,
    ok: false,
    errorCode: result.errorCode,
    errorMessage: result.errorMessage,
    meta: toWireMeta(result.meta),
  };
}

export async function postWorkerComplete(
  client: ApiClient,
  sourceId: number,
  result: IngestJobResult
): Promise<void> {
  const url = `${client.apiUrl}/ingest/worker-complete`;
  const body = JSON.stringify(buildInput(sourceId, result));

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-pops-internal-token': client.internalToken,
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '<no-body>');
    throw new Error(
      `ingest.workerComplete returned HTTP ${response.status}: ${text.slice(0, 500)}`
    );
  }
}
