/**
 * Integration tests for `cerebrum.ingest.*` over REST.
 *
 * Boots the app against a per-test temp cerebrum.db + temp engram root, an
 * injected offline {@link makeFakeIngestLlm} stub (so no real Anthropic call is
 * ever made), and a `() => null` curation-queue accessor (no Redis — exercises
 * the soft `requeued: false` path). Real file IO against the SQLite index makes
 * the create/dedup paths meaningful.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCerebrumDb, type OpenedCerebrumDb } from '../../db/index.js';
import { createCerebrumApiApp } from '../app.js';
import {
  makeClient,
  makeFakeIngestLlm,
  makeReflexService,
  makeTemplateRegistry,
} from './test-utils.js';

import type { IngestLlm } from '../modules/ingest/llm.js';

let tmpDir: string;
let engramRoot: string;
let cerebrumDb: OpenedCerebrumDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-api-ingest-test-'));
  engramRoot = mkdtempSync(join(tmpdir(), 'cerebrum-api-ingest-root-'));
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: false });
});

afterEach(() => {
  cerebrumDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  rmSync(engramRoot, { recursive: true, force: true });
});

const CLASSIFY_OP = 'cerebrum.classify';
const EXTRACT_OP = 'cerebrum.extract-entities';
const INFER_OP = 'cerebrum.infer-scopes';

function client(llm: IngestLlm = makeFakeIngestLlm()) {
  return makeClient(
    createCerebrumApiApp({
      cerebrumDb,
      templateRegistry: makeTemplateRegistry(),
      engramRoot,
      reflexService: makeReflexService(cerebrumDb.db, join(tmpDir, 'reflexes.toml')),
      ingestLlm: llm,
      curationQueue: () => null,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3007',
    })
  );
}

describe('POST /ingest/classify', () => {
  it('returns the LLM classification when confidence clears the threshold', async () => {
    const llm = makeFakeIngestLlm({
      [CLASSIFY_OP]: () =>
        JSON.stringify({
          type: 'decision',
          confidence: 0.95,
          template: 'decision',
          suggested_tags: ['architecture', 'database'],
        }),
    });
    const result = await client(llm).ingest.classify('We chose SQLite over Postgres.');
    expect(result.type).toBe('decision');
    expect(result.confidence).toBeCloseTo(0.95);
    expect(result.template).toBe('decision');
    expect(result.suggestedTags).toEqual(['architecture', 'database']);
  });

  it('falls back to capture below the confidence threshold', async () => {
    const llm = makeFakeIngestLlm({
      [CLASSIFY_OP]: () =>
        JSON.stringify({
          type: 'journal',
          confidence: 0.3,
          template: 'journal',
          suggested_tags: [],
        }),
    });
    const result = await client(llm).ingest.classify('hmm');
    expect(result.type).toBe('capture');
    expect(result.template).toBeNull();
  });

  it('falls back to capture when the LLM is unavailable (no responder)', async () => {
    const result = await client().ingest.classify('anything');
    expect(result.type).toBe('capture');
    expect(result.confidence).toBe(0);
  });

  it('400s on an empty body', async () => {
    await expect(client().ingest.classify('   ')).rejects.toMatchObject({ status: 400 });
  });
});

describe('POST /ingest/extract-entities', () => {
  it('converts above-threshold entities into prefixed tags + referenced dates', async () => {
    const llm = makeFakeIngestLlm({
      [EXTRACT_OP]: () =>
        JSON.stringify([
          { type: 'person', value: 'Alice', normalised: 'Alice', confidence: 0.9 },
          { type: 'date', value: 'next Monday', normalised: '2026-06-22', confidence: 0.8 },
          { type: 'topic', value: 'noise', normalised: 'noise', confidence: 0.2 },
        ]),
    });
    const result = await client(llm).ingest.extractEntities('Met Alice next Monday');
    expect(result.tags).toContain('person:Alice');
    expect(result.tags).toContain('date:2026-06-22');
    expect(result.tags).not.toContain('topic:noise');
    expect(result.referencedDates).toEqual(['2026-06-22']);
    expect(result.entities).toHaveLength(2);
  });

  it('returns empty when the LLM is unavailable', async () => {
    const result = await client().ingest.extractEntities('Met Alice');
    expect(result).toEqual({ entities: [], tags: [], referencedDates: [] });
  });
});

describe('POST /ingest/infer-scopes', () => {
  it('returns explicit scopes as-is (tier 1, no LLM)', async () => {
    const result = await client().ingest.inferScopes({
      body: 'content',
      type: 'note',
      explicitScopes: ['work.projects.alpha'],
    });
    expect(result.source).toBe('explicit');
    expect(result.scopes).toEqual(['work.projects.alpha']);
    expect(result.confidence).toBe(1);
  });

  it('falls back to the default scope when no rules match and the LLM is unavailable', async () => {
    const result = await client().ingest.inferScopes({ body: 'content', type: 'note' });
    expect(result.source).toBe('fallback');
    expect(result.scopes).toEqual(['personal.captures']);
  });

  it('uses the LLM tier (tier 3) when rules miss and a responder is present', async () => {
    const llm = makeFakeIngestLlm({
      [INFER_OP]: () => JSON.stringify({ scopes: ['work.learning.rust'], confidence: 0.8 }),
    });
    const result = await client(llm).ingest.inferScopes({ body: 'learning rust', type: 'note' });
    expect(result.source).toBe('llm');
    expect(result.scopes).toEqual(['work.learning.rust']);
  });
});

describe('POST /ingest/submit', () => {
  it('runs the full pipeline and writes an engram to disk + index', async () => {
    const llm = makeFakeIngestLlm({
      [CLASSIFY_OP]: () =>
        JSON.stringify({ type: 'note', confidence: 0.9, template: null, suggested_tags: ['ml'] }),
      [EXTRACT_OP]: () =>
        JSON.stringify([
          { type: 'topic', value: 'embeddings', normalised: 'embeddings', confidence: 0.9 },
        ]),
    });
    const c = client(llm);
    const result = await c.ingest.submit({
      body: '# Vector search\n\nNotes on embeddings.',
      scopes: ['work.projects.alpha'],
    });
    expect(result.engram.id).toMatch(/^eng_\d{8}_\d{4}_/);
    expect(result.engram.type).toBe('note');
    expect(result.engram.scopes).toEqual(['work.projects.alpha']);
    expect(result.engram.tags).toContain('topic:embeddings');
    expect(result.engram.tags).toContain('ml');
    expect(result.scopeInference.source).toBe('explicit');

    const got = await c.ingest.enrichmentStatus(result.engram.id);
    expect(got.type).toBe('note');
  });

  it('dedupes identical normalised content to the existing engram', async () => {
    const c = client();
    const body = 'A unique capture body for dedup.';
    const first = await c.ingest.submit({ body, type: 'note', scopes: ['work.projects.alpha'] });
    const second = await c.ingest.submit({ body, type: 'note', scopes: ['work.projects.alpha'] });
    expect(second.engram.id).toBe(first.engram.id);
    const all = await c.engrams.search({});
    expect(all.total).toBe(1);
  });

  it('400s on an empty body', async () => {
    await expect(client().ingest.submit({ body: '   ' })).rejects.toMatchObject({ status: 400 });
  });

  it('400s on an invalid source channel', async () => {
    await expect(
      client().ingest.submit({ body: 'x', type: 'note', scopes: ['work.a.b'], source: 'bogus' })
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('POST /ingest/preview', () => {
  it('returns pipeline output without writing an engram', async () => {
    const c = client();
    const result = await c.ingest.preview({
      body: 'preview body content',
      type: 'note',
      scopes: ['work.projects.alpha'],
    });
    expect(result.normalisedBody).toBe('preview body content');
    expect(result.scopeInference.scopes).toEqual(['work.projects.alpha']);
    const all = await c.engrams.search({});
    expect(all.total).toBe(0);
  });
});

describe('POST /ingest/quick-capture', () => {
  it('creates an engram and reports requeued:false without Redis', async () => {
    const c = client();
    const result = await c.ingest.quickCapture({ text: 'quick thought' });
    expect(result.id).toMatch(/^eng_\d{8}_\d{4}_/);
    expect(result.type).toBe('capture');
    expect(result.requeued).toBe(false);
    expect(result.scopes.length).toBeGreaterThan(0);
    const got = await c.engrams.get(result.id);
    expect(got.engram.type).toBe('capture');
  });

  it('writes user-suggested scopes and sets the reconcile flag', async () => {
    const c = client();
    const result = await c.ingest.quickCapture({
      text: 'scoped capture',
      scopes: ['work.projects.beta'],
    });
    expect(result.scopes).toEqual(['work.projects.beta']);
    const got = await c.engrams.get(result.id);
    expect(got.engram.customFields['_reconcile_scopes']).toBe(true);
  });
});

describe('POST /ingest/enrichment-status', () => {
  it('reports not-enriched for a fresh capture and 404s on a miss', async () => {
    const c = client();
    const captured = await c.ingest.quickCapture({ text: 'status probe' });
    const status = await c.ingest.enrichmentStatus(captured.id);
    expect(status.enriched).toBe(false);
    expect(status.scopeSuggestions).toEqual([]);

    await expect(c.ingest.enrichmentStatus('eng_20260101_0000_missing')).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('POST /ingest/retry-enrichment', () => {
  it('reports requeued:false without Redis for an existing engram', async () => {
    const c = client();
    const captured = await c.ingest.quickCapture({ text: 'retry probe' });
    const result = await c.ingest.retryEnrichment(captured.id);
    expect(result.engramId).toBe(captured.id);
    expect(result.requeued).toBe(false);
  });

  it('404s when the engram does not exist', async () => {
    await expect(client().ingest.retryEnrichment('eng_20260101_0000_ghost')).rejects.toMatchObject({
      status: 404,
    });
  });
});
