/**
 * Request handlers for the cerebrum pillar container.
 *
 * Logic lives here (not inline in `app.ts`) so tests can call into the shape
 * directly without booting Express. Per-domain REST handlers compose
 * alongside the health + pillars probes via `rest/handlers.ts`.
 */
import { getPillarRegistry } from './pillars/registry.js';

import type { PillarRegistryEntry } from '@pops/types';

import type { OpenedCerebrumDb } from '../db/index.js';
import type { GenerationLlm } from './modules/emit/llm.js';
import type { IngestLlm } from './modules/ingest/llm.js';
import type { CurationQueueAccessor } from './modules/ingest/pipeline.js';
import type { QueryLlm, QueryStreamLlm } from './modules/query/llm.js';
import type { ReflexService } from './modules/reflex/reflex-service.js';
import type { EmbeddingClient } from './modules/retrieval/embedding-client.js';
import type { PeerClients } from './modules/retrieval/peer-clients.js';
import type { TemplateRegistry } from './modules/templates/registry.js';

export interface CerebrumApiDeps {
  /** Open handle to the cerebrum pillar's SQLite (sqlite-vec loaded). */
  cerebrumDb: OpenedCerebrumDb;
  /** In-memory registry of on-disk engram templates. */
  templateRegistry: TemplateRegistry;
  /**
   * Root directory holding the engram Markdown files (the SQLite index is a
   * regenerable cache of it). Resolved from `CEREBRUM_ENGRAMS_DIR` at boot.
   */
  engramRoot: string;
  /** TOML-driven reflex registry + execution-log accessor (PRD-089). */
  reflexService: ReflexService;
  /**
   * Absolute path to the glia graduation-threshold TOML (`glia.toml`).
   * Optional — defaults to `resolveGliaConfigPath()` (env-driven, tolerant of
   * a missing file → hardcoded ADR-021 defaults). Tests pin it to a fixture.
   */
  gliaConfigPath?: string;
  /**
   * LLM port driving the ingest classifier / entity-extractor / scope-inference
   * stages. Optional — defaults to an Anthropic-backed client (`ANTHROPIC_API_KEY`,
   * hardcoded haiku models). Tests inject an offline fake.
   */
  ingestLlm?: IngestLlm;
  /**
   * Accessor for the `pops-curation` BullMQ queue used by ingest
   * quick-capture / retry-enrichment. Optional — defaults to the lazy
   * `getCurationQueue()` singleton (returns `null` without Redis). Tests pass a
   * `() => null` accessor to exercise the no-Redis path.
   */
  curationQueue?: CurationQueueAccessor;
  /** Semver of the build, surfaced on the health response. */
  version: string;
  /**
   * HTTP origin cerebrum-api is reachable at. Surfaced as the synthetic
   * `cerebrum` entry in `GET /pillars` so consumers don't have to
   * special-case the host pillar.
   */
  selfBaseUrl: string;
  /**
   * Cross-pillar enrichment clients for `retrieval` semantic-search metadata
   * resolution. Built from `POPS_PILLARS` in `server.ts`; tests inject fakes.
   * A peer absent from the registry yields an `undefined` client for that
   * source type (enrichment skipped, not a crash).
   */
  peerClients: PeerClients;
  /**
   * Optional query-embedding client for `retrieval` semantic search. Absent
   * (no `EMBEDDING_API_KEY`) → semantic search returns no results and hybrid
   * degrades to BM25-only.
   */
  embeddingClient?: EmbeddingClient;
  /**
   * LLM port driving the `emit` document-generation pipeline. Optional —
   * defaults to an Anthropic-backed client (`ANTHROPIC_API_KEY`,
   * `claude-sonnet-4-6` / `CEREBRUM_EMIT_MODEL`). Tests inject an offline fake.
   */
  emitLlm?: GenerationLlm;
  /**
   * One-shot LLM port driving `query.ask`. Optional — defaults to an
   * Anthropic-backed client (`ANTHROPIC_API_KEY`, `claude-sonnet-4-6` /
   * `CEREBRUM_QUERY_MODEL`). Tests inject an offline fake.
   */
  queryLlm?: QueryLlm;
  /**
   * Streaming LLM port driving the `POST /query/stream` SSE route. Optional —
   * defaults to an Anthropic streaming client. Tests inject a fake that yields
   * canned tokens (no real API).
   */
  queryStreamLlm?: QueryStreamLlm;
}

export interface HealthResponse {
  ok: true;
  status: 'ok';
  pillar: 'cerebrum';
  version: string;
  ts: string;
}

export interface PillarsResponse {
  pillars: readonly PillarRegistryEntry[];
}

export function makeRequestHandler(deps: CerebrumApiDeps): {
  health(): HealthResponse;
  pillars(): PillarsResponse;
} {
  return {
    health(): HealthResponse {
      // Touch the DB so a closed handle surfaces as a thrown error (caught by
      // the Express error pipeline -> 500) rather than a bogus 200 OK that
      // hides a broken connection.
      deps.cerebrumDb.raw.prepare('SELECT 1').get();
      return {
        ok: true,
        status: 'ok',
        pillar: 'cerebrum',
        version: deps.version,
        ts: new Date().toISOString(),
      };
    },
    pillars(): PillarsResponse {
      return { pillars: getPillarRegistry({ selfBaseUrl: deps.selfBaseUrl }) };
    },
  };
}
