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
  GliaActionTypeWire,
  GliaActionStatusWire,
  GliaActionWire,
  GliaDigestDeliveryWire,
  GliaDigestReportWire,
  GliaRevertResultWire,
  GliaTransitionResultWire,
  GliaTrustStateWire,
  GliaUserDecisionWire,
} from '../../contract/rest-glia-schemas.js';
import type {
  ClassificationResultWire,
  IngestEnrichmentStatusResponseWire,
  IngestExtractEntitiesResponseWire,
  IngestPreviewResponseWire,
  IngestQuickCaptureResponseWire,
  IngestRetryEnrichmentResponseWire,
  IngestSubmitResponseWire,
  ScopeInferenceResultWire,
} from '../../contract/rest-ingest-schemas.js';
import type {
  NudgeContradictionWire,
  NudgePriorityWire,
  NudgeStatusWire,
  NudgeTypeWire,
  NudgeWire,
} from '../../contract/rest-nudges.js';
import type {
  RetrievalFiltersWire,
  RetrievalModeWire,
  RetrievalResultWire,
  RetrievalStatsWire,
  SourceAttributionWire,
} from '../../contract/rest-retrieval-schemas.js';
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
  ReflexExecutionStatusWire,
  ReflexExecutionWire,
  ReflexTriggerTypeWire,
  ReflexWithStatusWire,
  TemplateSummaryWire,
  TemplateWire,
} from '../../contract/rest-schemas.js';
import type { CerebrumDb } from '../../db/index.js';
import type { IngestLlm, IngestLlmRequest } from '../modules/ingest/llm.js';
import type { ReflexService } from '../modules/reflex/reflex-service.js';
import type { PeerClients } from '../modules/retrieval/peer-clients.js';

/**
 * Offline {@link IngestLlm} stub. Tests pass a per-operation responder map
 * keyed by the {@link IngestLlmRequest.operation} label; an unmapped operation
 * resolves to `null` (the stage falls back, never reaching a real API).
 */
export function makeFakeIngestLlm(
  responders: Partial<Record<string, (req: IngestLlmRequest) => string | null>> = {}
): IngestLlm {
  return {
    modelFor: () => 'fake-haiku',
    complete: (req) => Promise.resolve(responders[req.operation]?.(req) ?? null),
  };
}

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

/**
 * Empty peer-client set — no cross-pillar enrichment. The default for tests
 * that don't exercise the `retrieval` cross-pillar path; pass a partial fake
 * to {@link createCerebrumApiApp} where enrichment is under test.
 */
export function makeEmptyPeerClients(): PeerClients {
  return {};
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

export interface ReflexHistoryFilters {
  name?: string;
  triggerType?: ReflexTriggerTypeWire;
  status?: ReflexExecutionStatusWire;
  limit?: number;
  offset?: number;
}

export interface GliaActionFilters {
  actionType?: GliaActionTypeWire;
  status?: GliaActionStatusWire;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

export interface GliaDigestInput {
  period?: 'daily' | 'weekly';
  actionType?: GliaActionTypeWire;
  rejectionRateThreshold?: number;
  deliver?: boolean;
}

export interface ListNudgesFilters {
  type?: NudgeTypeWire;
  status?: NudgeStatusWire;
  priority?: NudgePriorityWire;
  limit?: number;
  offset?: number;
}

export interface ListContradictionsFilters {
  status?: NudgeStatusWire | null;
  limit?: number;
  offset?: number;
}

export interface IngestSubmitInput {
  body: string;
  title?: string;
  type?: string;
  scopes?: string[];
  tags?: string[];
  template?: string;
  source?: string;
  customFields?: Record<string, unknown>;
}

export interface IngestInferScopesInput {
  body: string;
  type: string;
  tags?: string[];
  source?: string;
  explicitScopes?: string[];
  knownScopes?: string[];
}

export interface IngestQuickCaptureInput {
  text: string;
  source?: string;
  scopes?: string[];
}

export interface RetrievalSearchBody {
  query?: string;
  mode?: RetrievalModeWire;
  filters?: RetrievalFiltersWire;
  limit?: number;
  threshold?: number;
  offset?: number;
}

export interface RetrievalContextBody {
  query: string;
  filters?: RetrievalFiltersWire;
  tokenBudget?: number;
  includeMetadata?: boolean;
  maxResults?: number;
}

export interface RetrievalSimilarBody {
  engramId: string;
  limit?: number;
  threshold?: number;
  filters?: RetrievalFiltersWire;
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
    nudges: {
      list: (filters: ListNudgesFilters = {}) =>
        send<{ nudges: NudgeWire[]; total: number }>(r.post('/nudges/search').send(filters)),
      get: (id: string) => send<{ nudge: NudgeWire }>(r.get(`/nudges/${id}`)),
      dismiss: (id: string) => send<{ success: boolean }>(r.post(`/nudges/${id}/dismiss`).send({})),
      contradictions: (filters: ListContradictionsFilters = {}) =>
        send<{ contradictions: NudgeContradictionWire[]; total: number }>(
          r.post('/nudges/contradictions').send(filters)
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
    glia: {
      list: (filters: GliaActionFilters = {}) =>
        send<{ actions: GliaActionWire[]; total: number }>(
          r.post('/glia/actions/search').send(filters)
        ),
      get: (id: string) => send<{ action: GliaActionWire }>(r.get(`/glia/actions/${id}`)),
      decide: (id: string, decision: GliaUserDecisionWire, note?: string) =>
        send<{ action: GliaActionWire; transition: GliaTransitionResultWire }>(
          r.post(`/glia/actions/${id}/decide`).send({ decision, ...(note ? { note } : {}) })
        ),
      execute: (id: string) =>
        send<{ action: GliaActionWire }>(r.post(`/glia/actions/${id}/execute`).send({})),
      revert: (id: string) =>
        send<{
          action: GliaActionWire;
          transition: GliaTransitionResultWire;
          revertResult: GliaRevertResultWire;
        }>(r.post(`/glia/actions/${id}/revert`).send({})),
      history: (filters: GliaActionFilters = {}) =>
        send<{ actions: GliaActionWire[]; total: number }>(
          r.post('/glia/actions/history').send(filters)
        ),
      trustStateGet: (actionType: GliaActionTypeWire) =>
        send<{ state: GliaTrustStateWire }>(r.get(`/glia/trust-state/${actionType}`)),
      trustStateList: () => send<{ states: GliaTrustStateWire[] }>(r.get('/glia/trust-state')),
      digest: (input: GliaDigestInput = {}) =>
        send<{ report: GliaDigestReportWire; delivery: GliaDigestDeliveryWire }>(
          r.post('/glia/digest').send(input)
        ),
    },
    ingest: {
      submit: (body: IngestSubmitInput) =>
        send<IngestSubmitResponseWire>(r.post('/ingest/submit').send(body)),
      preview: (body: IngestSubmitInput) =>
        send<IngestPreviewResponseWire>(r.post('/ingest/preview').send(body)),
      classify: (body: string, title?: string) =>
        send<ClassificationResultWire>(
          r.post('/ingest/classify').send({ body, ...(title ? { title } : {}) })
        ),
      extractEntities: (body: string, existingTags?: string[]) =>
        send<IngestExtractEntitiesResponseWire>(
          r
            .post('/ingest/extract-entities')
            .send({ body, ...(existingTags ? { existingTags } : {}) })
        ),
      inferScopes: (input: IngestInferScopesInput) =>
        send<ScopeInferenceResultWire>(r.post('/ingest/infer-scopes').send(input)),
      quickCapture: (input: IngestQuickCaptureInput) =>
        send<IngestQuickCaptureResponseWire>(r.post('/ingest/quick-capture').send(input)),
      enrichmentStatus: (engramId: string) =>
        send<IngestEnrichmentStatusResponseWire>(
          r.post('/ingest/enrichment-status').send({ engramId })
        ),
      retryEnrichment: (engramId: string) =>
        send<IngestRetryEnrichmentResponseWire>(
          r.post('/ingest/retry-enrichment').send({ engramId })
        ),
    },
    retrieval: {
      search: (body: RetrievalSearchBody = {}) =>
        send<{ results: RetrievalResultWire[]; meta: { total: number; mode: RetrievalModeWire } }>(
          r.post('/retrieval/search').send(body)
        ),
      context: (body: RetrievalContextBody) =>
        send<{
          context: string;
          sources: SourceAttributionWire[];
          truncated: boolean;
          tokenEstimate: number;
        }>(r.post('/retrieval/context').send(body)),
      similar: (body: RetrievalSimilarBody) =>
        send<{ results: RetrievalResultWire[] }>(r.post('/retrieval/similar').send(body)),
      stats: () => send<RetrievalStatsWire>(r.get('/retrieval/stats')),
    },
  };
}
