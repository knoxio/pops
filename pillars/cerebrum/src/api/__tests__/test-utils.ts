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
  PlexusAdapterWire,
  PlexusFilterDefinitionWire,
  PlexusFilterWire,
  PlexusHealthResultWire,
  PlexusSyncResultWire,
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

export function makeClient(app: Express) {
  const r = supertest.agent(app);
  return {
    templates: {
      list: () => send<{ templates: TemplateSummaryWire[] }>(r.get('/templates')),
      get: (name: string) => send<{ template: TemplateWire }>(r.get(`/templates/${name}`)),
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
