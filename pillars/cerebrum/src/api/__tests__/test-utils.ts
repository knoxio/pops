/**
 * Supertest-backed REST client + shared deps builder for the cerebrum-api
 * integration tests. Non-2xx responses throw `HttpError` carrying the parsed
 * `{ status, body }` so tests assert on `.rejects.toMatchObject({ status })`.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import supertest from 'supertest';

import { TemplateRegistry } from '../modules/templates/registry.js';

import type { Express } from 'express';

import type {
  EngramWire,
  PlexusAdapterWire,
  PlexusFilterDefinitionWire,
  PlexusFilterWire,
  PlexusHealthResultWire,
  PlexusSyncResultWire,
  ScopeInfoWire,
  ScopeSuggestionWire,
  TagInfoWire,
  TemplateSummaryWire,
  TemplateWire,
} from '../../contract/rest-schemas.js';

/** Bundled engram-template fixtures shipped with the pillar. */
export const TEST_TEMPLATES_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'modules',
  'templates',
  'defaults'
);

export function makeTemplateRegistry(): TemplateRegistry {
  return new TemplateRegistry(TEST_TEMPLATES_DIR);
}

export class HttpError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown) {
    const message =
      body !== null && typeof body === 'object' && 'message' in body
        ? String((body as { message: unknown }).message)
        : `HTTP ${status}`;
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

async function send<T>(req: supertest.Test): Promise<T> {
  const res = await req;
  if (res.status >= 200 && res.status < 300) return res.body as T;
  throw new HttpError(res.status, res.body);
}

export interface CreateEngramBody {
  type: string;
  title: string;
  body?: string;
  scopes?: string[];
  tags?: string[];
  template?: string;
  customFields?: Record<string, unknown>;
  source?: string;
  links?: string[];
}

export interface UpdateEngramBody {
  title?: string;
  body?: string;
  scopes?: string[];
  tags?: string[];
  customFields?: Record<string, unknown>;
  status?: string;
  template?: string;
}

export interface SearchEngramsBody {
  type?: string;
  scopes?: string[];
  tags?: string[];
  ids?: string[];
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
  sort?: { field: 'created_at' | 'modified_at' | 'title'; direction: 'asc' | 'desc' };
}

export function makeClient(app: Express) {
  const r = supertest.agent(app);
  return {
    templates: {
      list: () => send<{ templates: TemplateSummaryWire[] }>(r.get('/templates')),
      get: (name: string) => send<{ template: TemplateWire }>(r.get(`/templates/${name}`)),
    },
    engrams: {
      create: (body: CreateEngramBody) =>
        send<{ engram: EngramWire }>(r.post('/engrams').send(body)),
      get: (id: string) => send<{ engram: EngramWire; body: string }>(r.get(`/engrams/${id}`)),
      update: (id: string, body: UpdateEngramBody) =>
        send<{ engram: EngramWire }>(r.patch(`/engrams/${id}`).send(body)),
      delete: (id: string) => send<{ success: true }>(r.delete(`/engrams/${id}`)),
      search: (body: SearchEngramsBody = {}) =>
        send<{ engrams: EngramWire[]; total: number }>(r.post('/engrams/search').send(body)),
      link: (sourceId: string, targetId: string) =>
        send<{ success: true }>(r.post(`/engrams/${sourceId}/links`).send({ targetId })),
      unlink: (sourceId: string, targetId: string) =>
        send<{ success: true }>(r.delete(`/engrams/${sourceId}/links/${targetId}`)),
    },
    scopes: {
      assign: (engramId: string, scopes: string[]) =>
        send<{ engram: EngramWire }>(r.post(`/engrams/${engramId}/scopes`).send({ scopes })),
      remove: (engramId: string, scopes: string[]) =>
        send<{ engram: EngramWire }>(r.post(`/engrams/${engramId}/scopes/remove`).send({ scopes })),
      reclassify: (fromScope: string, toScope: string, dryRun?: boolean) =>
        send<{ count: number; ids: string[]; rolled_back?: boolean }>(
          r.post('/scopes/reclassify').send({ fromScope, toScope, dryRun })
        ),
      list: (prefix?: string) =>
        send<{ scopes: ScopeInfoWire[] }>(r.get('/scopes').query(prefix ? { prefix } : {})),
      validate: (scope: string) =>
        send<{ valid: boolean; scope?: string; errors?: string[] }>(
          r.post('/scopes/validate').send({ scope })
        ),
      reconcile: (suggestedScopes: string[]) =>
        send<{ reconciled: ScopeSuggestionWire[] }>(
          r.post('/scopes/reconcile').send({ suggestedScopes })
        ),
      filter: (scopes: string[], includeSecret?: boolean) =>
        send<{ engrams: EngramWire[] }>(r.post('/scopes/filter').send({ scopes, includeSecret })),
    },
    tags: {
      list: (prefix?: string, limit?: number) =>
        send<{ tags: TagInfoWire[] }>(
          r.get('/tags').query({ ...(prefix ? { prefix } : {}), ...(limit ? { limit } : {}) })
        ),
    },
    plexus: {
      listAdapters: () => send<{ adapters: PlexusAdapterWire[] }>(r.get('/plexus/adapters')),
      getAdapter: (adapterId: string) =>
        send<{ adapter: PlexusAdapterWire }>(r.get(`/plexus/adapters/${adapterId}`)),
      healthCheck: (adapterId: string) =>
        send<PlexusHealthResultWire>(r.post(`/plexus/adapters/${adapterId}/health-check`).send({})),
      sync: (adapterId: string) =>
        send<PlexusSyncResultWire>(r.post(`/plexus/adapters/${adapterId}/sync`).send({})),
      unregister: (adapterId: string) =>
        send<{ success: boolean }>(r.post(`/plexus/adapters/${adapterId}/unregister`).send({})),
      listFilters: (adapterId: string) =>
        send<{ filters: PlexusFilterWire[] }>(r.get(`/plexus/adapters/${adapterId}/filters`)),
      setFilters: (adapterId: string, filters: PlexusFilterDefinitionWire[]) =>
        send<{ filters: PlexusFilterWire[] }>(
          r.post(`/plexus/adapters/${adapterId}/filters`).send({ filters })
        ),
    },
  };
}
