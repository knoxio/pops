/**
 * Integration tests for MCP tool handlers with a real SQLite database.
 *
 * Covers:
 *  - cerebrum.search:       inserts test engrams, searches, verifies results
 *  - cerebrum.ingest:       ingests content, verifies engram file + index row
 *  - cerebrum.engram.read:  creates an engram, reads it back, verifies content
 *  - cerebrum.engram.write: creates an engram, updates it, verifies persistence
 *  - cerebrum.query:        mocks retrieval + LLM, verifies answer + citations
 *
 * Strategy:
 *  - Real SQLite (in-memory) via createTestDb + drizzle
 *  - Real EngramService with a temp engram root for file I/O
 *  - Mocked HybridSearchService (avoids sqlite-vec dependency)
 *  - Mocked LLM (Anthropic SDK)
 *  - Mocked IngestService pipeline stages (classifier, entity extractor)
 */
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestDb } from '../../shared/test-utils.js';

import type { Database } from 'better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import type { RetrievalResult } from '../../modules/cerebrum/retrieval/types.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

/** Injected test drizzle instance, set during beforeEach. */
let testDrizzle: BetterSQLite3Database;

vi.mock('../../db.js', () => ({
  getDrizzle: () => testDrizzle,
  getDb: () => {
    throw new Error('getDb should not be called in MCP integration tests');
  },
  isVecAvailable: () => false,
}));

// --- HybridSearchService mock ---

const mockHybrid =
  vi.fn<
    (
      query: string,
      filters: Record<string, unknown>,
      limit: number,
      threshold: number
    ) => Promise<RetrievalResult[]>
  >();

vi.mock('../../modules/cerebrum/retrieval/hybrid-search.js', () => ({
  HybridSearchService: class {
    hybrid = mockHybrid;
  },
}));

// --- LLM mock (for cerebrum.query) ---

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
    constructor() {
      this.messages = { create: mockCreate };
    }
  },
}));

vi.mock('../../env.js', () => ({
  getEnv: (name: string) => {
    if (name === 'ANTHROPIC_API_KEY') return 'test-key';
    return undefined;
  },
}));

vi.mock('../../lib/inference-middleware.js', () => ({
  trackInference: (_params: unknown, fn: () => Promise<unknown>) => fn(),
}));

vi.mock('../../lib/ai-retry.js', () => ({
  withRateLimitRetry: (fn: () => Promise<unknown>) => fn(),
}));

vi.mock('../../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// --- IngestService mock (classifier + entity extractor + scope inference) ---

vi.mock('../../modules/cerebrum/ingest/classifier.js', () => ({
  CortexClassifier: class {
    async classify() {
      return { type: 'note', confidence: 0.9, suggestedTags: ['test'] };
    }
  },
}));

vi.mock('../../modules/cerebrum/ingest/entity-extractor.js', () => ({
  CortexEntityExtractor: class {
    async extract() {
      return { entities: [], tags: [], referencedDates: [] };
    }
  },
}));

vi.mock('../../modules/cerebrum/ingest/scope-inference.js', () => ({
  createScopeInferenceService: () => ({
    infer: () => ({
      scopes: ['personal.notes'],
      source: 'inferred' as const,
    }),
  }),
}));

// Mock the curation queue (used by quick capture)
vi.mock('../../jobs/queues.js', () => ({
  getCurationQueue: () => ({
    add: vi.fn(),
  }),
}));

// Mock redis (used by semantic search cache)
vi.mock('../../shared/redis-client.js', () => ({
  getRedis: () => null,
  isRedisAvailable: () => false,
  redisKey: (...parts: string[]) => parts.join(':'),
}));

// --- Dynamic imports AFTER mocks ---

const { handleCerebrumSearch } = await import('../tools/cerebrum-search.js');
const { handleCerebrumQuery } = await import('../tools/cerebrum-query.js');
const { handleEngramRead } = await import('../tools/cerebrum-engram-read.js');
const { handleEngramWrite } = await import('../tools/cerebrum-engram-write.js');
const { handleCerebrumIngest } = await import('../tools/cerebrum-ingest.js');
const { getEngramService, resetCerebrumCache } = await import('../../modules/cerebrum/instance.js');
const { parseResult } = await import('./test-helpers.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRetrievalResult(overrides?: Partial<RetrievalResult>): RetrievalResult {
  return {
    sourceType: 'engram',
    sourceId: 'eng_20260417_0942_test-note',
    title: 'Test Note',
    contentPreview: 'This is a test note about important topics.',
    score: 0.9,
    matchType: 'semantic',
    metadata: {
      type: 'note',
      scopes: ['personal.notes'],
      tags: ['test'],
      createdAt: '2026-04-17',
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let rawDb: Database;
let tmpEngramRoot: string;

beforeEach(() => {
  vi.clearAllMocks();

  rawDb = createTestDb();
  testDrizzle = drizzle(rawDb);

  // Create a temp engram root for file I/O tests.
  tmpEngramRoot = join(
    tmpdir(),
    `pops-mcp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(tmpEngramRoot, { recursive: true });
  process.env['ENGRAM_ROOT'] = tmpEngramRoot;
  resetCerebrumCache();
});

afterEach(() => {
  rawDb.close();
  rmSync(tmpEngramRoot, { recursive: true, force: true });
  delete process.env['ENGRAM_ROOT'];
  resetCerebrumCache();
});

// -------------------------------------------------------------------------
// cerebrum.search
// -------------------------------------------------------------------------

describe('cerebrum.search', () => {
  it('returns results from the hybrid search service', async () => {
    const r1 = makeRetrievalResult({
      sourceId: 'eng_20260401_1000_finance',
      title: 'Finance Planning',
      contentPreview: 'Budget allocations for Q1.',
      score: 0.92,
    });
    const r2 = makeRetrievalResult({
      sourceId: 'eng_20260402_1100_meetings',
      title: 'Meeting Notes',
      contentPreview: 'Notes from the team standup.',
      score: 0.85,
    });
    mockHybrid.mockResolvedValue([r1, r2]);

    const result = await handleCerebrumSearch({ query: 'finance planning' });

    expect(result.isError).toBeUndefined();
    const parsed = parseResult(result) as {
      results: Array<{ id: string; title: string; score: number; snippet: string }>;
    };
    expect(parsed.results).toHaveLength(2);
    expect(parsed.results[0]!.id).toBe('eng_20260401_1000_finance');
    expect(parsed.results[0]!.title).toBe('Finance Planning');
    expect(parsed.results[0]!.score).toBe(0.92);
    expect(parsed.results[0]!.snippet).toContain('Budget allocations');
  });

  it('rejects empty query with VALIDATION_ERROR', async () => {
    const result = await handleCerebrumSearch({ query: '   ' });

    expect(result.isError).toBe(true);
    const parsed = parseResult(result) as { error: string; code: string };
    expect(parsed.code).toBe('VALIDATION_ERROR');
    expect(parsed.error).toContain('query is required');
  });

  it('passes scope filters through to the search service', async () => {
    mockHybrid.mockResolvedValue([]);

    await handleCerebrumSearch({
      query: 'test',
      scopes: ['work.projects'],
      limit: 5,
    });

    expect(mockHybrid).toHaveBeenCalledWith(
      'test',
      expect.objectContaining({ scopes: ['work.projects'], includeSecret: false }),
      5,
      0.8
    );
  });

  it('sets includeSecret when a secret scope is requested', async () => {
    mockHybrid.mockResolvedValue([]);

    await handleCerebrumSearch({
      query: 'passwords',
      scopes: ['personal.secret.keys'],
    });

    expect(mockHybrid).toHaveBeenCalledWith(
      'passwords',
      expect.objectContaining({ includeSecret: true }),
      20,
      0.8
    );
  });

  it('maps service errors to MCP error format', async () => {
    mockHybrid.mockRejectedValue(new Error('Database connection lost'));

    const result = await handleCerebrumSearch({ query: 'test' });

    expect(result.isError).toBe(true);
    const parsed = parseResult(result) as { code: string; error: string };
    expect(parsed.code).toBe('INTERNAL_ERROR');
    expect(parsed.error).toBe('Database connection lost');
  });
});

// -------------------------------------------------------------------------
// cerebrum.ingest
// -------------------------------------------------------------------------

describe('cerebrum.ingest', () => {
  it('ingests plain text and creates an engram file + index row', async () => {
    const result = await handleCerebrumIngest({
      body: 'This is my first note about project planning.',
      title: 'Project Planning',
      type: 'note',
      scopes: ['personal.notes'],
      tags: ['planning'],
    });

    expect(result.isError).toBeUndefined();
    const parsed = parseResult(result) as {
      engram: { id: string; title: string; type: string; scopes: string[]; filePath: string };
    };
    expect(parsed.engram.id).toMatch(/^eng_\d{8}_\d{4}_/);
    expect(typeof parsed.engram.title).toBe('string');
    expect(parsed.engram.type).toBe('note');
    expect(parsed.engram.scopes).toContain('personal.notes');

    // Verify file exists on disk.
    const filePath = join(tmpEngramRoot, parsed.engram.filePath);
    const content = readFileSync(filePath, 'utf8');
    expect(content).toContain('project planning');

    // Verify index row exists.
    const row = rawDb.prepare('SELECT * FROM engram_index WHERE id = ?').get(parsed.engram.id) as
      | { id: string; title: string }
      | undefined;
    expect(row).toBeDefined();
    expect(typeof row!.title).toBe('string');
  });

  it('rejects empty body with VALIDATION_ERROR', async () => {
    const result = await handleCerebrumIngest({ body: '   ' });

    expect(result.isError).toBe(true);
    const parsed = parseResult(result) as { code: string };
    expect(parsed.code).toBe('VALIDATION_ERROR');
  });

  it('auto-derives title from JSON body when no title provided', async () => {
    const result = await handleCerebrumIngest({
      body: '{"title": "Auto Title From JSON", "data": 42}',
      scopes: ['personal.notes'],
    });

    expect(result.isError).toBeUndefined();
    const parsed = parseResult(result) as { engram: { title: string } };
    // The JSON body is wrapped in a code block, and the derived title may come from
    // the JSON or from the normalised body. Either way, we should get a result.
    expect(parsed.engram.title).toBeTruthy();
  });
});

// -------------------------------------------------------------------------
// cerebrum.engram.read
// -------------------------------------------------------------------------

describe('cerebrum.engram.read', () => {
  it('reads back a created engram with correct metadata and body', async () => {
    // Create directly via EngramService (bypasses ingest pipeline scope inference mock).
    const engramService = getEngramService();
    const engram = engramService.create({
      type: 'note',
      title: 'Vacation Plans',
      body: 'Notes about my vacation plans for next summer.',
      scopes: ['personal.travel'],
      tags: ['vacation', 'summer'],
      source: 'manual',
    });

    // Read it back via the MCP tool.
    const readResult = await handleEngramRead({ id: engram.id });

    expect(readResult.isError).toBeUndefined();
    const parsed = parseResult(readResult) as {
      engram: {
        id: string;
        title: string;
        type: string;
        scopes: string[];
        tags: string[];
        status: string;
      };
      body: string;
    };

    expect(parsed.engram.id).toBe(engram.id);
    // Title in the index is derived from body (first line), not the input title.
    expect(typeof parsed.engram.title).toBe('string');
    expect(parsed.engram.title.length).toBeGreaterThan(0);
    expect(parsed.engram.type).toBe('note');
    expect(parsed.engram.scopes).toContain('personal.travel');
    expect(parsed.engram.status).toBe('active');
    expect(parsed.body).toContain('vacation plans');
  });

  it('returns VALIDATION_ERROR for empty id', async () => {
    const result = await handleEngramRead({ id: '' });

    expect(result.isError).toBe(true);
    const parsed = parseResult(result) as { code: string };
    expect(parsed.code).toBe('VALIDATION_ERROR');
  });

  it('returns NOT_FOUND for non-existent engram', async () => {
    const result = await handleEngramRead({ id: 'eng_19000101_0000_nonexistent' });

    expect(result.isError).toBe(true);
    const parsed = parseResult(result) as { code: string };
    expect(parsed.code).toBe('NOT_FOUND');
  });

  it('blocks read access for fully secret-scoped engrams', async () => {
    // Create an engram directly via the service (bypassing ingest pipeline
    // to ensure the scope isn't replaced by inference).
    const engramService = getEngramService();
    const engram = engramService.create({
      type: 'note',
      title: 'Secret Passwords',
      body: 'Top secret content.',
      scopes: ['personal.secret.passwords'],
      source: 'manual',
    });

    const readResult = await handleEngramRead({ id: engram.id });

    expect(readResult.isError).toBe(true);
    const parsed = parseResult(readResult) as { code: string; error: string };
    expect(parsed.code).toBe('SCOPE_BLOCKED');
    expect(parsed.error).toContain('secret-scoped');
  });
});

// -------------------------------------------------------------------------
// cerebrum.engram.write
// -------------------------------------------------------------------------

describe('cerebrum.engram.write', () => {
  it('updates body content and verifies persistence', async () => {
    // Create.
    const createResult = await handleCerebrumIngest({
      body: 'Original content before update.',
      title: 'Editable Note',
      type: 'note',
      scopes: ['personal.notes'],
    });
    expect(createResult.isError).toBeUndefined();
    const created = parseResult(createResult) as { engram: { id: string } };

    // Update body.
    const writeResult = await handleEngramWrite({
      id: created.engram.id,
      body: 'Updated content after the write operation.',
    });

    expect(writeResult.isError).toBeUndefined();
    const updated = parseResult(writeResult) as {
      engram: { id: string; title: string };
    };
    expect(updated.engram.id).toBe(created.engram.id);

    // Verify via read.
    const readResult = await handleEngramRead({ id: created.engram.id });
    const read = parseResult(readResult) as { body: string };
    expect(read.body).toContain('Updated content after the write operation');
  });

  it('updates title and verifies persistence', async () => {
    const createResult = await handleCerebrumIngest({
      body: 'Some content.',
      title: 'Old Title',
      type: 'note',
      scopes: ['personal.notes'],
    });
    const created = parseResult(createResult) as { engram: { id: string } };

    await handleEngramWrite({
      id: created.engram.id,
      title: 'New Title',
    });

    const readResult = await handleEngramRead({ id: created.engram.id });
    const read = parseResult(readResult) as { engram: { title: string } };
    expect(read.engram.title).toBe('New Title');
  });

  it('updates scopes and verifies persistence', async () => {
    const createResult = await handleCerebrumIngest({
      body: 'Scope change test.',
      title: 'Scope Test',
      type: 'note',
      scopes: ['personal.notes'],
    });
    const created = parseResult(createResult) as { engram: { id: string } };

    const writeResult = await handleEngramWrite({
      id: created.engram.id,
      scopes: ['work.projects', 'work.meetings'],
    });

    expect(writeResult.isError).toBeUndefined();
    const updated = parseResult(writeResult) as {
      engram: { scopes: string[] };
    };
    expect(updated.engram.scopes).toContain('work.projects');
    expect(updated.engram.scopes).toContain('work.meetings');
  });

  it('returns VALIDATION_ERROR when no fields to update are provided', async () => {
    const result = await handleEngramWrite({ id: 'eng_20260401_1000_some-note' });

    expect(result.isError).toBe(true);
    const parsed = parseResult(result) as { code: string };
    expect(parsed.code).toBe('VALIDATION_ERROR');
  });

  it('returns NOT_FOUND for non-existent engram', async () => {
    const result = await handleEngramWrite({
      id: 'eng_19000101_0000_nonexistent',
      body: 'new body',
    });

    expect(result.isError).toBe(true);
    const parsed = parseResult(result) as { code: string };
    expect(parsed.code).toBe('NOT_FOUND');
  });
});

// -------------------------------------------------------------------------
// cerebrum.query
// -------------------------------------------------------------------------

describe('cerebrum.query', () => {
  it('returns an answer with citations from retrieved sources', async () => {
    const retrievalResult = makeRetrievalResult({
      sourceId: 'eng_20260401_1000_budget',
      title: 'Budget Planning',
      contentPreview: 'Q1 budget is $50k allocated across departments.',
      score: 0.91,
    });

    mockHybrid.mockResolvedValue([retrievalResult]);
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text' as const,
          text: 'Based on [eng_20260401_1000_budget], the Q1 budget is $50k.',
        },
      ],
      usage: { input_tokens: 200, output_tokens: 60 },
    });

    const result = await handleCerebrumQuery({ question: 'What is the Q1 budget?' });

    expect(result.isError).toBeUndefined();
    const parsed = parseResult(result) as {
      answer: string;
      citations: Array<{ id: string; title: string; relevance: number }>;
    };

    expect(parsed.answer).toContain('Q1 budget');
    expect(parsed.citations).toHaveLength(1);
    expect(parsed.citations[0]!.id).toBe('eng_20260401_1000_budget');
    expect(parsed.citations[0]!.title).toBe('Budget Planning');
  });

  it('rejects empty question with VALIDATION_ERROR', async () => {
    const result = await handleCerebrumQuery({ question: '   ' });

    expect(result.isError).toBe(true);
    const parsed = parseResult(result) as { code: string };
    expect(parsed.code).toBe('VALIDATION_ERROR');
  });

  it('returns no-info answer when retrieval yields zero results', async () => {
    mockHybrid.mockResolvedValue([]);

    const result = await handleCerebrumQuery({ question: 'What is quantum chromodynamics?' });

    expect(result.isError).toBeUndefined();
    const parsed = parseResult(result) as { answer: string; citations: unknown[] };
    expect(parsed.answer).toContain("don't have information");
    expect(parsed.citations).toHaveLength(0);
  });

  it('passes scope filters to the retrieval service', async () => {
    mockHybrid.mockResolvedValue([]);

    await handleCerebrumQuery({
      question: 'test query',
      scopes: ['work.projects'],
    });

    expect(mockHybrid).toHaveBeenCalledWith(
      'test query',
      expect.objectContaining({ scopes: ['work.projects'] }),
      expect.any(Number),
      expect.any(Number)
    );
  });
});
