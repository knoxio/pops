/**
 * Raw HTTP client for posting worker results back to pops-api.
 *
 * Replaces the tRPC typed client (which would couple the worker to
 * pops-api's compiled `AppRouter` type) with a single-purpose fetch
 * against the `food.ingest.workerComplete` tRPC endpoint. The wire
 * format is tRPC v11's batched POST shape (`{ "0": { "json": <input> } }`
 * at `?batch=1`) — pops-api keeps its existing `httpBatchLink` handler.
 *
 * The auth header (`x-pops-internal-token`) is the contract PRD-125
 * landed; pops-api validates the lowercase form regardless of the
 * PRD-126 spec text saying `X-Internal-Token` (see
 * `apps/pops-api/src/trpc.ts`'s `isInternalCall`).
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
 * pops-api's `MetaSchema` is a zod `.passthrough()`, so the inferred
 * router input adds a `[k: string]: unknown` index signature that
 * `IngestMeta`'s interface lacks. `toWireMeta` rebuilds it as a plain
 * record so the shapes line up without weakening the contract type.
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
  const url = `${client.apiUrl}/trpc/food.ingest.workerComplete?batch=1`;
  const body = JSON.stringify({ 0: { json: buildInput(sourceId, result) } });

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
      `food.ingest.workerComplete returned HTTP ${response.status}: ${text.slice(0, 500)}`
    );
  }

  const payload = (await response.json().catch(() => null)) as ReadonlyArray<{
    error?: { json?: { message?: string } };
  }> | null;
  const errorEntry = payload?.find((entry) => entry?.error !== undefined);
  if (errorEntry?.error !== undefined) {
    const msg = errorEntry.error.json?.message ?? 'unknown tRPC error';
    throw new Error(`food.ingest.workerComplete tRPC error: ${msg}`);
  }
}
