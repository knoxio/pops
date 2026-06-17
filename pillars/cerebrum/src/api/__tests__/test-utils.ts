/**
 * Supertest-backed REST client + shared deps builder for the cerebrum-api
 * integration tests. Non-2xx responses throw `HttpError` carrying the parsed
 * `{ status, body }` so tests assert on `.rejects.toMatchObject({ status })`.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import supertest from 'supertest';

import { buildReflexService } from '../modules/reflex/instance.js';
import { TemplateRegistry } from '../modules/templates/registry.js';

import type { Express } from 'express';

import type {
  PlexusAdapterWire,
  PlexusFilterDefinitionWire,
  PlexusFilterWire,
  PlexusHealthResultWire,
  PlexusSyncResultWire,
  ReflexExecutionStatusWire,
  ReflexExecutionWire,
  ReflexTriggerTypeWire,
  ReflexWithStatusWire,
  TemplateSummaryWire,
  TemplateWire,
} from '../../contract/rest-schemas.js';
import type { CerebrumDb } from '../../db/index.js';
import type { ReflexService } from '../modules/reflex/reflex-service.js';

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

/**
 * Build a {@link ReflexService} pointed at a test-controlled TOML path with
 * the chokidar watcher disabled. Pass a path to a fixture, or a path to a
 * non-existent file to exercise the empty-reflex-set boot.
 */
export function makeReflexService(db: CerebrumDb, configPath: string): ReflexService {
  return buildReflexService({ db, configPath, watch: false });
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

export interface ReflexHistoryFilters {
  name?: string;
  triggerType?: ReflexTriggerTypeWire;
  status?: ReflexExecutionStatusWire;
  limit?: number;
  offset?: number;
}

export function makeClient(app: Express) {
  const r = supertest.agent(app);
  return {
    templates: {
      list: () => send<{ templates: TemplateSummaryWire[] }>(r.get('/templates')),
      get: (name: string) => send<{ template: TemplateWire }>(r.get(`/templates/${name}`)),
    },
    reflex: {
      list: (timezone?: string) =>
        send<{ reflexes: ReflexWithStatusWire[] }>(
          r.get('/reflex').query(timezone ? { timezone } : {})
        ),
      get: (name: string) =>
        send<{ reflex: ReflexWithStatusWire; history: ReflexExecutionWire[] }>(
          r.get(`/reflex/${name}`)
        ),
      test: (name: string) =>
        send<{ result: ReflexExecutionWire | null }>(r.post(`/reflex/${name}/test`).send({})),
      enable: (name: string) =>
        send<{ success: boolean }>(r.post(`/reflex/${name}/enable`).send({})),
      disable: (name: string) =>
        send<{ success: boolean }>(r.post(`/reflex/${name}/disable`).send({})),
      history: (filters: ReflexHistoryFilters = {}) =>
        send<{ executions: ReflexExecutionWire[]; total: number }>(
          r.post('/reflex/history').send(filters)
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
