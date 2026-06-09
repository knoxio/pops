import { createTRPCClient, httpBatchLink } from '@trpc/client';

import type { AppRouter } from '@pops/api';
import type { IngestJobResult } from '@pops/food-contracts';

export type TrpcClient = ReturnType<typeof createTRPCClient<AppRouter>>;

/**
 * Build a tRPC client that auths against pops-api's `internalProcedure`
 * gate. The `x-pops-internal-token` header is the contract PRD-125
 * landed; the PRD-126 spec text says `X-Internal-Token` but the actual
 * api validates the lowercase `x-pops-internal-token` name (see
 * `apps/pops-api/src/trpc.ts`'s `isInternalCall`).
 */
export function createApiClient(opts: { apiUrl: string; internalToken: string }): TrpcClient {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${opts.apiUrl.replace(/\/+$/, '')}/trpc`,
        headers: () => ({ 'x-pops-internal-token': opts.internalToken }),
      }),
    ],
  });
}

/**
 * Post a job result back to pops-api. The mutation input is flattened
 * (sourceId + result fields) per PRD-125's `WorkerCompleteInput` shape.
 */
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

export async function postWorkerComplete(
  client: TrpcClient,
  sourceId: number,
  result: IngestJobResult
): Promise<void> {
  if (result.ok) {
    await client.food.ingest.workerComplete.mutate({
      sourceId,
      ok: true,
      dsl: result.dsl,
      meta: toWireMeta(result.meta),
      ...(result.partialReason !== undefined ? { partialReason: result.partialReason } : {}),
    });
    return;
  }
  await client.food.ingest.workerComplete.mutate({
    sourceId,
    ok: false,
    errorCode: result.errorCode,
    errorMessage: result.errorMessage,
    meta: toWireMeta(result.meta),
  });
}
