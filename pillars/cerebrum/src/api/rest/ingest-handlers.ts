/**
 * ts-rest handlers for `cerebrum.ingest.*` (PRD-081).
 *
 * Each handler builds a request-scoped {@link IngestService} bound to the
 * pillar DB handle, engram root, template registry, injected LLM port, and the
 * curation-queue accessor, then delegates. The service throws the pillar
 * `HttpError` subclasses; `runHttp` maps `NotFoundError` → 404 and
 * `ValidationError` → 400. `source` is a free string at the contract edge,
 * validated here against the engram source grammar so a bad channel surfaces
 * as 400 rather than corrupting frontmatter (parity with `engrams.create`).
 *
 * Queue null path (no Redis): `quickCapture` returns `requeued: false` — the
 * engram is still written, so a missing queue is a soft signal, not a 503.
 * `retryEnrichment` likewise returns `requeued: false` (the engram exists; the
 * caller can poll `enrichmentStatus` and retry later).
 */
import { initServer } from '@ts-rest/express';
import { z } from 'zod';

import { cerebrumIngestContract } from '../../contract/rest-ingest.js';
import { scopeSuggestionSchema } from '../../contract/rest-schemas.js';
import { engramSourceSchema, type EngramSource } from '../modules/engrams/schema.js';
import { IngestService, type IngestServiceDeps } from '../modules/ingest/pipeline.js';
import { ValidationError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

const server: ReturnType<typeof initServer> = initServer();

const scopeSuggestionsSchema = z.array(scopeSuggestionSchema).catch([]);

function parseSource(source: string | undefined): EngramSource | undefined {
  if (source === undefined) return undefined;
  const parsed = engramSourceSchema.safeParse(source);
  if (!parsed.success) {
    throw new ValidationError({ message: parsed.error.issues[0]?.message ?? 'invalid source' });
  }
  return parsed.data;
}

export function makeIngestHandlers(
  deps: IngestServiceDeps
): ReturnType<typeof server.router<typeof cerebrumIngestContract>> {
  const service = (): IngestService => new IngestService(deps);

  return server.router(cerebrumIngestContract, {
    submit: async ({ body }) =>
      runHttp(async () => {
        const result = await service().submit({ ...body, source: parseSource(body.source) });
        return { status: 200 as const, body: result };
      }),

    preview: async ({ body }) =>
      runHttp(async () => {
        const result = await service().preview({ ...body, source: parseSource(body.source) });
        return { status: 200 as const, body: result };
      }),

    classify: async ({ body }) =>
      runHttp(async () => {
        const result = await service().classify(body.body, body.title);
        return { status: 200 as const, body: result };
      }),

    extractEntities: async ({ body }) =>
      runHttp(async () => {
        const result = await service().extractEntities(body.body, body.existingTags);
        return { status: 200 as const, body: result };
      }),

    inferScopes: async ({ body }) =>
      runHttp(async () => {
        const result = await service().inferScopes({
          body: body.body,
          type: body.type,
          tags: body.tags ?? [],
          source: parseSource(body.source) ?? 'manual',
          explicitScopes: body.explicitScopes,
          knownScopes: body.knownScopes,
        });
        return { status: 200 as const, body: result };
      }),

    quickCapture: async ({ body }) =>
      runHttp(async () => {
        const result = await service().quickCapture(
          body.text,
          parseSource(body.source),
          body.scopes
        );
        return { status: 200 as const, body: result };
      }),

    enrichmentStatus: async ({ body }) =>
      runHttp(() => {
        const { engram } = service().readEngram(body.engramId);
        const enriched = engram.customFields['_enrichedHash'] === engram.contentHash;
        const rawSuggestions = engram.customFields['_scope_suggestions'];
        const scopeSuggestions = Array.isArray(rawSuggestions)
          ? scopeSuggestionsSchema.parse(rawSuggestions)
          : [];
        return {
          status: 200 as const,
          body: {
            enriched,
            type: engram.type,
            template: engram.template,
            scopes: engram.scopes,
            tags: engram.tags,
            scopeSuggestions,
          },
        };
      }),

    retryEnrichment: async ({ body }) =>
      runHttp(async () => {
        const requeued = await service().retryEnrichment(body.engramId);
        return { status: 200 as const, body: { engramId: body.engramId, requeued } };
      }),
  });
}
