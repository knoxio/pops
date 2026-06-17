/**
 * ts-rest handlers for `cerebrum.engrams.*`.
 *
 * Each handler builds a request-scoped {@link EngramService} bound to the
 * pillar DB handle, the engram root, and the template registry, then delegates
 * to it. The service throws the pillar `HttpError` subclasses; `runHttp` maps
 * `NotFoundError` → 404 and `ValidationError` → 400. The `source` field is a
 * free string at the contract edge and is validated here against the engram
 * source grammar so a bad channel surfaces as 400 rather than corrupting
 * frontmatter.
 */
import { initServer } from '@ts-rest/express';

import { cerebrumEngramsContract } from '../../contract/rest-engrams.js';
import { type CerebrumDb } from '../../db/index.js';
import { engramSourceSchema, type EngramSource } from '../modules/engrams/schema.js';
import { EngramService } from '../modules/engrams/service.js';
import { ValidationError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

import type { TemplateRegistry } from '../modules/templates/registry.js';

const server: ReturnType<typeof initServer> = initServer();

export interface EngramHandlerDeps {
  db: CerebrumDb;
  engramRoot: string;
  templates: TemplateRegistry;
}

function parseSource(source: string | undefined): EngramSource | undefined {
  if (source === undefined) return undefined;
  const parsed = engramSourceSchema.safeParse(source);
  if (!parsed.success) {
    throw new ValidationError({ message: parsed.error.issues[0]?.message ?? 'invalid source' });
  }
  return parsed.data;
}

export function makeEngramsHandlers(
  deps: EngramHandlerDeps
): ReturnType<typeof server.router<typeof cerebrumEngramsContract>> {
  const service = (): EngramService =>
    new EngramService({ root: deps.engramRoot, db: deps.db, templates: deps.templates });

  return server.router(cerebrumEngramsContract, {
    create: async ({ body }) =>
      runHttp(() => {
        const engram = service().create({ ...body, source: parseSource(body.source) });
        return { status: 200, body: { engram } };
      }),
    get: async ({ params }) =>
      runHttp(() => {
        const { engram, body } = service().read(params.id);
        return { status: 200, body: { engram, body } };
      }),
    update: async ({ params, body }) =>
      runHttp(() => {
        const engram = service().update(params.id, body);
        return { status: 200, body: { engram } };
      }),
    delete: async ({ params }) =>
      runHttp(() => {
        service().archive(params.id);
        return { status: 200, body: { success: true as const } };
      }),
    list: async ({ body }) => {
      const { engrams, total } = service().list(body);
      return { status: 200, body: { engrams, total } };
    },
    link: async ({ params, body }) =>
      runHttp(() => {
        service().link(params.sourceId, body.targetId);
        return { status: 200, body: { success: true as const } };
      }),
    unlink: async ({ params }) =>
      runHttp(() => {
        service().unlink(params.sourceId, params.targetId);
        return { status: 200, body: { success: true as const } };
      }),
  });
}
