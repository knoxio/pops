/**
 * ts-rest handlers for `cerebrum.emit.*` (pillars/cerebrum/docs/prds/document-generation).
 *
 * Each handler builds a request-scoped {@link GenerationService} bound to the
 * pillar db (drizzle + raw + vec availability), the injected peer/embedding
 * retrieval clients, and the injected {@link GenerationLlm} port, then
 * delegates. The service is stateless — all scope/audience filtering rides in
 * the request body — so there is no per-request auth.
 *
 * Mode-specific guards (report needs a query, summary needs a date range,
 * `from <= to`) map to 400 via the pillar {@link ValidationError} + `runHttp`.
 */
import { initServer } from '@ts-rest/express';

import { cerebrumEmitContract } from '../../contract/rest-emit.js';
import { type CerebrumDb } from '../../db/index.js';
import {
  GenerationService,
  type GenerationServiceDeps,
} from '../modules/emit/generation-service.js';
import { type GenerationLlm } from '../modules/emit/llm.js';
import { ValidationError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

import type BetterSqlite3 from 'better-sqlite3';

import type { EmitDateRangeWire } from '../../contract/rest-emit-schemas.js';
import type { EmbeddingClient } from '../modules/retrieval/embedding-client.js';
import type { PeerClients } from '../modules/retrieval/peer-clients.js';

const server: ReturnType<typeof initServer> = initServer();

export interface EmitHandlerDeps {
  db: CerebrumDb;
  raw: BetterSqlite3.Database;
  vecAvailable: boolean;
  peers: PeerClients;
  embeddingClient?: EmbeddingClient;
  llm: GenerationLlm;
}

function validateDateRange(dateRange: EmitDateRangeWire | undefined): void {
  if (!dateRange) return;
  if (dateRange.from > dateRange.to) {
    throw new ValidationError({
      message: 'Invalid date range: from must be before or equal to to',
    });
  }
}

export function makeEmitHandlers(
  deps: EmitHandlerDeps
): ReturnType<typeof server.router<typeof cerebrumEmitContract>> {
  const serviceDeps: GenerationServiceDeps = {
    db: deps.db,
    raw: deps.raw,
    vecAvailable: deps.vecAvailable,
    peers: deps.peers,
    embeddingClient: deps.embeddingClient,
    llm: deps.llm,
  };
  const service = (): GenerationService => new GenerationService(serviceDeps);

  return server.router(cerebrumEmitContract, {
    generate: async ({ body }) =>
      runHttp(async () => {
        if (body.mode === 'report' && !body.query) {
          throw new ValidationError({ message: 'Query is required for report mode' });
        }
        if (body.mode === 'summary' && !body.dateRange) {
          throw new ValidationError({ message: 'Date range is required for summary mode' });
        }
        validateDateRange(body.dateRange);
        const result = await service().generate({
          mode: body.mode,
          query: body.query,
          dateRange: body.dateRange,
          scopes: body.scopes,
          audienceScope: body.audienceScope,
          includeSecret: body.includeSecret,
          types: body.types,
          tags: body.tags,
          format: body.format === 'plain' ? 'plain' : 'markdown',
          groupBy: body.groupBy,
        });
        return { status: 200 as const, body: result };
      }),

    generateReport: async ({ body }) =>
      runHttp(async () => {
        const result = await service().generateReport({
          mode: 'report',
          query: body.query,
          scopes: body.scopes,
          audienceScope: body.audienceScope,
          includeSecret: body.includeSecret,
          types: body.types,
          tags: body.tags,
        });
        return { status: 200 as const, body: result };
      }),

    generateSummary: async ({ body }) =>
      runHttp(async () => {
        validateDateRange(body.dateRange);
        const result = await service().generateSummary({
          mode: 'summary',
          query: body.query,
          dateRange: body.dateRange,
          scopes: body.scopes,
          audienceScope: body.audienceScope,
          includeSecret: body.includeSecret,
          types: body.types,
          tags: body.tags,
        });
        return { status: 200 as const, body: result };
      }),

    generateTimeline: async ({ body }) =>
      runHttp(async () => {
        validateDateRange(body.dateRange);
        const result = await service().generateTimeline({
          mode: 'timeline',
          query: body.query,
          dateRange: body.dateRange,
          scopes: body.scopes,
          audienceScope: body.audienceScope,
          includeSecret: body.includeSecret,
          types: body.types,
          tags: body.tags,
          groupBy: body.groupBy,
        });
        return { status: 200 as const, body: result };
      }),

    preview: async ({ body }) =>
      runHttp(async () => {
        validateDateRange(body.dateRange);
        const result = await service().preview({
          mode: body.mode,
          query: body.query,
          dateRange: body.dateRange,
          scopes: body.scopes,
          audienceScope: body.audienceScope,
          includeSecret: body.includeSecret,
          types: body.types,
          tags: body.tags,
          groupBy: body.groupBy,
        });
        return { status: 200 as const, body: result };
      }),
  });
}
