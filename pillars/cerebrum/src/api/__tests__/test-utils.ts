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
  DebriefMediaTypeWire,
  DebriefResultWire,
  DebriefSessionWire,
} from '../../contract/rest-debrief-schemas.js';
import type {
  ConversationMessageWire,
  ConversationWire,
  EgoChatBodyWire,
  EgoChatResponseWire,
  GetActiveContextResponseWire,
} from '../../contract/rest-ego-schemas.js';
import type { EmbeddingsStatusWire } from '../../contract/rest-embeddings.js';
import type {
  EmitSourceCitationWire,
  GeneratedDocumentWire,
  GenerationGroupByWire,
  GenerationModeWire,
} from '../../contract/rest-emit-schemas.js';
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
  IndexReconcileResponseWire,
  IndexReindexResponseWire,
  IndexReindexSourcesResponseWire,
  IndexStatusResponseWire,
} from '../../contract/rest-index-schemas.js';
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
  NudgeConfigureWire,
  NudgeContradictionWire,
  NudgePriorityWire,
  NudgeStatusWire,
  NudgeTypeWire,
  NudgeWire,
} from '../../contract/rest-nudges.js';
import type {
  QueryConfidenceWire,
  QueryDomainWire,
  QuerySourceCitationWire,
} from '../../contract/rest-query-schemas.js';
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
import type {
  OrphansResponseWire,
  QualityResultWire,
  StalenessResultWire,
  WorkerRunResultWire,
} from '../../contract/rest-workers-schemas.js';
import type { CerebrumDb } from '../../db/index.js';
import type { EgoLlm, EgoStreamEvent } from '../modules/ego/llm.js';
import type { GenerationLlm } from '../modules/emit/llm.js';
import type { IngestLlm, IngestLlmRequest } from '../modules/ingest/llm.js';
import type { ContradictionAnalyzer } from '../modules/nudges/contradiction-analyzer.js';
import type { ContradictionEvidence } from '../modules/nudges/types.js';
import type { QueryLlm, QueryStreamChunk, QueryStreamLlm } from '../modules/query/llm.js';
import type { ReflexService } from '../modules/reflex/reflex-service.js';
import type { PeerClients } from '../modules/retrieval/peer-clients.js';
import type { ContradictionDetector } from '../modules/workers/auditor.js';

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

/**
 * Offline {@link EgoLlm} stub. `reply` is the canned chat content; `stream`
 * splits it into per-word tokens (so SSE tests see multiple `token` frames
 * then a `done`). Never reaches a real API.
 */
export function makeFakeEgoLlm(reply = 'Canned ego reply.'): EgoLlm {
  return {
    model: () => 'fake-sonnet',
    chat: () => Promise.resolve({ content: reply, tokensIn: 7, tokensOut: 11 }),
    summarise: () => Promise.resolve('Canned summary.'),
    async *stream(): AsyncGenerator<EgoStreamEvent> {
      const words = reply.split(' ');
      for (const word of words) {
        yield { type: 'token', text: `${word} ` };
      }
      yield { type: 'done', fullText: reply, tokensIn: 7, tokensOut: 11 };
    },
  };
}

/**
 * Offline {@link ContradictionDetector} stub for the auditor worker. Returns
 * `conflict` for every pair when set, else null (no contradiction).
 */
export function makeFakeContradictionDetector(
  conflict: string | null = null
): ContradictionDetector {
  return { detectContradiction: () => Promise.resolve(conflict) };
}

/**
 * Offline {@link ContradictionAnalyzer} stub for the nudges pattern detector.
 * The responder receives both engram ids + bodies and returns structured
 * evidence (or null for no contradiction); the default surfaces nothing. Never
 * reaches a real API.
 */
export function makeFakeContradictionAnalyzer(
  responder: (
    engramA: string,
    bodyA: string,
    engramB: string,
    bodyB: string
  ) => ContradictionEvidence | null = () => null
): ContradictionAnalyzer {
  return {
    analyze: (engramA, bodyA, engramB, bodyB) =>
      Promise.resolve(responder(engramA, bodyA, engramB, bodyB)),
  };
}

/**
 * Offline {@link GenerationLlm} stub for the `emit` slice. The responder
 * receives the system prompt + user message and returns canned document text;
 * the default echoes a fixed string. Never reaches a real API.
 */
export function makeFakeGenerationLlm(
  responder: (systemPrompt: string, userMessage: string) => string = () => '# Generated\n\nbody'
): GenerationLlm {
  return {
    generate: (systemPrompt, userMessage) => Promise.resolve(responder(systemPrompt, userMessage)),
  };
}

/**
 * Offline one-shot {@link QueryLlm} stub for `query.ask`. The responder returns
 * the canned answer text; the default is a fixed string. Never reaches a real
 * API.
 */
export function makeFakeQueryLlm(
  responder: (systemPrompt: string, question: string) => string = () => 'A canned answer.'
): QueryLlm {
  return {
    complete: (systemPrompt, question) => Promise.resolve(responder(systemPrompt, question)),
  };
}

/**
 * Offline streaming {@link QueryStreamLlm} stub for the SSE route. Yields each
 * supplied token as a `delta`, then a `final` carrying the given usage counts.
 * Never reaches a real API.
 */
export function makeFakeQueryStreamLlm(
  tokens: string[] = ['Canned ', 'streamed ', 'answer.'],
  usage: { tokensIn: number; tokensOut: number } = { tokensIn: 0, tokensOut: 0 }
): QueryStreamLlm {
  async function* stream(): AsyncGenerator<QueryStreamChunk> {
    for (const text of tokens) {
      yield { kind: 'delta', text };
    }
    yield { kind: 'final', tokensIn: usage.tokensIn, tokensOut: usage.tokensOut };
  }
  return { stream };
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

export interface CreateNudgeInput {
  type?: NudgeTypeWire;
  title: string;
  body: string;
  priority: NudgePriorityWire;
  engramIds?: string[];
  expiresAt?: string | null;
  action?: {
    type: 'consolidate' | 'archive' | 'review' | 'link';
    label: string;
    params: Record<string, unknown>;
  } | null;
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

export interface EmitGenerateInput {
  mode: GenerationModeWire;
  query?: string;
  dateRange?: { from: string; to: string };
  scopes?: string[];
  audienceScope?: string;
  includeSecret?: boolean;
  types?: string[];
  tags?: string[];
  format?: 'markdown' | 'plain';
  groupBy?: GenerationGroupByWire;
}

export interface EmitReportInput {
  query: string;
  scopes?: string[];
  audienceScope?: string;
  includeSecret?: boolean;
  types?: string[];
  tags?: string[];
}

export interface EmitSummaryInput {
  dateRange: { from: string; to: string };
  query?: string;
  scopes?: string[];
  audienceScope?: string;
  includeSecret?: boolean;
  types?: string[];
  tags?: string[];
}

export interface EmitTimelineInput {
  query?: string;
  dateRange?: { from: string; to: string };
  scopes?: string[];
  audienceScope?: string;
  includeSecret?: boolean;
  types?: string[];
  tags?: string[];
  groupBy?: GenerationGroupByWire;
}

export interface QueryAskInput {
  question: string;
  scopes?: string[];
  includeSecret?: boolean;
  maxSources?: number;
  domains?: QueryDomainWire[];
}

export interface QueryRetrieveInput {
  question: string;
  scopes?: string[];
  includeSecret?: boolean;
  maxSources?: number;
}

type EmitDocumentResponse = {
  document: GeneratedDocumentWire | null;
  notice?: string;
};

type QueryAskResponse = {
  answer: string;
  sources: QuerySourceCitationWire[];
  scopes: string[];
  confidence: QueryConfidenceWire;
};

type QueryExplainResponse = {
  scopeInference: { scopes: string[]; source: 'explicit' | 'inferred' | 'default' };
  retrievalPlan: { filters: RetrievalFiltersWire; maxSources: number; threshold: number };
  secretNotice: string | null;
};

export interface DebriefRecordInput {
  sessionId: number;
  dimensionId: number;
  comparisonId: number | null;
}

export interface DebriefCreateInput {
  watchHistoryId: number;
  mediaType: DebriefMediaTypeWire;
  mediaId: number;
}

export interface DebriefListPendingInput {
  mediaType?: DebriefMediaTypeWire;
  mediaId?: number;
  limit?: number;
  offset?: number;
}

type DebriefListPendingResponse = {
  data: DebriefSessionWire[];
  pagination: { limit: number; offset: number; total: number };
};

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
      create: (input: CreateNudgeInput) =>
        send<{ nudge: NudgeWire }>(r.post('/nudges').send(input)),
      list: (filters: ListNudgesFilters = {}) =>
        send<{ nudges: NudgeWire[]; total: number }>(r.post('/nudges/search').send(filters)),
      get: (id: string) => send<{ nudge: NudgeWire }>(r.get(`/nudges/${id}`)),
      dismiss: (id: string) => send<{ success: boolean }>(r.post(`/nudges/${id}/dismiss`).send({})),
      contradictions: (filters: ListContradictionsFilters = {}) =>
        send<{ contradictions: NudgeContradictionWire[]; total: number }>(
          r.post('/nudges/contradictions').send(filters)
        ),
      scan: (body: { type?: NudgeTypeWire } = {}) =>
        send<{ created: number }>(r.post('/nudges/scan').send(body)),
      act: (id: string) =>
        send<{ result: { success: boolean; nudge: NudgeWire | null } }>(
          r.post(`/nudges/${id}/act`).send({})
        ),
      configure: (body: NudgeConfigureWire) =>
        send<{ success: boolean }>(r.post('/nudges/configure').send(body)),
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
    index: {
      status: () => send<IndexStatusResponseWire>(r.get('/index/status')),
      reindex: (force?: boolean) =>
        send<IndexReindexResponseWire>(r.post('/index/reindex').send({ force })),
      reindexSources: (sourceTypes?: string[]) =>
        send<IndexReindexSourcesResponseWire>(
          r.post('/index/reindex-sources').send(sourceTypes ? { sourceTypes } : {})
        ),
      reconcile: (dryRun?: boolean) =>
        send<IndexReconcileResponseWire>(r.post('/index/reconcile').send({ dryRun })),
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
    ego: {
      chat: (body: EgoChatBodyWire) => send<EgoChatResponseWire>(r.post('/ego/chat').send(body)),
      createConversation: (body: { model: string; title?: string; scopes?: string[] }) =>
        send<{ conversation: ConversationWire }>(r.post('/ego/conversations').send(body)),
      listConversations: (body: { limit?: number; offset?: number; search?: string } = {}) =>
        send<{ conversations: ConversationWire[]; total: number }>(
          r.post('/ego/conversations/search').send(body)
        ),
      getConversation: (id: string) =>
        send<{ conversation: ConversationWire; messages: ConversationMessageWire[] }>(
          r.get(`/ego/conversations/${id}`)
        ),
      deleteConversation: (id: string) =>
        send<{ success: true }>(r.delete(`/ego/conversations/${id}`)),
      setScopes: (id: string, scopes: string[]) =>
        send<{ scopes: string[] }>(r.post(`/ego/conversations/${id}/scopes`).send({ scopes })),
      getActiveContext: (id: string) =>
        send<GetActiveContextResponseWire>(r.get(`/ego/conversations/${id}/context`)),
      stream: (body: EgoChatBodyWire) => r.post('/ego/chat/stream').send(body),
    },
    workers: {
      runPruner: (dryRun?: boolean) =>
        send<WorkerRunResultWire>(r.post('/glia/workers/prune').send({ dryRun })),
      runConsolidator: (dryRun?: boolean) =>
        send<WorkerRunResultWire>(r.post('/glia/workers/consolidate').send({ dryRun })),
      runLinker: (dryRun?: boolean) =>
        send<WorkerRunResultWire>(r.post('/glia/workers/link').send({ dryRun })),
      runAuditor: (dryRun?: boolean) =>
        send<WorkerRunResultWire>(r.post('/glia/workers/audit').send({ dryRun })),
      getStalenessScore: (engramId: string) =>
        send<StalenessResultWire>(r.post('/glia/scores/staleness').send({ engramId })),
      getQualityScore: (engramId: string) =>
        send<QualityResultWire>(r.post('/glia/scores/quality').send({ engramId })),
      getOrphans: (limit?: number) =>
        send<OrphansResponseWire>(r.get('/glia/orphans').query(limit ? { limit } : {})),
    },
    emit: {
      generate: (body: EmitGenerateInput) =>
        send<EmitDocumentResponse>(r.post('/emit/generate').send(body)),
      generateReport: (body: EmitReportInput) =>
        send<EmitDocumentResponse>(r.post('/emit/report').send(body)),
      generateSummary: (body: EmitSummaryInput) =>
        send<EmitDocumentResponse>(r.post('/emit/summary').send(body)),
      generateTimeline: (body: EmitTimelineInput) =>
        send<EmitDocumentResponse>(r.post('/emit/timeline').send(body)),
      preview: (body: EmitGenerateInput) =>
        send<{ sources: EmitSourceCitationWire[]; outline: string }>(
          r.post('/emit/preview').send(body)
        ),
    },
    query: {
      ask: (body: QueryAskInput) => send<QueryAskResponse>(r.post('/query/ask').send(body)),
      retrieve: (body: QueryRetrieveInput) =>
        send<{ sources: QuerySourceCitationWire[] }>(r.post('/query/retrieve').send(body)),
      explain: (question: string) =>
        send<QueryExplainResponse>(r.post('/query/explain').send({ question })),
    },
    embeddings: {
      getStatus: (sourceType?: string) =>
        send<EmbeddingsStatusWire>(
          r.post('/embeddings/status').send(sourceType ? { sourceType } : {})
        ),
      listSourceIdsByType: (sourceType: string) =>
        send<{ sourceIds: string[] }>(r.post('/embeddings/source-ids').send({ sourceType })),
    },
    debrief: {
      get: (sessionId: number) =>
        send<{ data: DebriefSessionWire | null }>(r.post('/debrief/get').send({ sessionId })),
      getByMedia: (mediaType: DebriefMediaTypeWire, mediaId: number) =>
        send<{ data: DebriefSessionWire | null }>(
          r.post('/debrief/get-by-media').send({ mediaType, mediaId })
        ),
      listPending: (input: DebriefListPendingInput = {}) =>
        send<DebriefListPendingResponse>(r.post('/debrief/list-pending').send(input)),
      record: (input: DebriefRecordInput) =>
        send<{ data: DebriefResultWire }>(r.post('/debrief/record').send(input)),
      create: (input: DebriefCreateInput) =>
        send<{ data: DebriefSessionWire }>(r.post('/debrief').send(input)),
      logWatchCompletion: (input: DebriefCreateInput) =>
        send<{ sessionId: number; dimensionsQueued: number }>(
          r.post('/debrief/log-watch-completion').send(input)
        ),
      dismiss: (sessionId: number) =>
        send<{ data: DebriefSessionWire }>(r.post(`/debrief/${sessionId}/dismiss`).send({})),
      deleteByWatchHistoryId: (watchHistoryId: number) =>
        send<{ deletedSessions: number; deletedResults: number }>(
          r.post('/debrief/delete-by-watch-history').send({ watchHistoryId })
        ),
    },
  };
}
