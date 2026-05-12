/**
 * End-to-end integration tests for the agent ingest path (PRD-081 US-02).
 *
 * Covers the MCP entry points `cerebrum.ingest` and `cerebrum.quickCapture`
 * driving the full pipeline (normalise → classify → extract entities →
 * infer scopes → persist) against a real SQLite database and a real engram
 * file root. Only the external LLM calls and the BullMQ queue are mocked.
 *
 * The agent path shares every pipeline stage with the manual UI path
 * (US-01) — these tests verify that the wrappers in `ai-tools/ingest.ts`
 * and `ai-tools/quick-capture.ts` deliver the same shape and run the same
 * stages without reimplementation.
 */
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestDb } from '../../../../shared/test-utils.js';

import type { Database } from 'better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

// ---------------------------------------------------------------------------
// Mocks — external IO only. The IngestService and its sub-services run live.
// ---------------------------------------------------------------------------

let testDrizzle: BetterSQLite3Database;

vi.mock('../../../../db.js', () => ({
  getDrizzle: () => testDrizzle,
  getDb: () => {
    throw new Error('getDb should not be called in this integration test');
  },
  isVecAvailable: () => false,
}));

vi.mock('../../../../env.js', () => ({
  getEnv: (_name: string) => undefined,
}));

vi.mock('../../../../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

/**
 * Track classifyEngram job enqueues. The quick-capture path is supposed to
 * fire-and-forget a curation job; we capture the engram id so tests can
 * assert the wiring without a real Redis.
 */
const enqueued: { engramId: string }[] = [];

vi.mock('../../../../jobs/queues.js', () => ({
  getCurationQueue: () => ({
    add: vi.fn(async (_name: string, data: { engramId: string }) => {
      enqueued.push({ engramId: data.engramId });
    }),
  }),
}));

/**
 * Classifier behaviour table. Each test sets `mockClassify` to control the
 * type/template/confidence returned by `CortexClassifier.classify`. Default
 * mimics a confident classification of `note`.
 */
const mockClassify = vi.fn(async () => ({
  type: 'note',
  confidence: 0.95,
  template: null,
  suggestedTags: ['cli-suggested'],
}));

vi.mock('../../ingest/classifier.js', () => ({
  CortexClassifier: class {
    classify = mockClassify;
  },
}));

/**
 * Entity extractor behaviour. Default returns one person + one project tag
 * so we can verify they are merged into the engram's tag list.
 */
const mockExtract = vi.fn(async () => ({
  entities: [
    { type: 'person' as const, value: 'Alice', normalised: 'alice', confidence: 0.9 },
    {
      type: 'project' as const,
      value: 'POPS',
      normalised: 'pops',
      confidence: 0.85,
    },
  ],
  tags: ['person:alice', 'project:pops'],
  referencedDates: [],
}));

vi.mock('../../ingest/entity-extractor.js', () => ({
  CortexEntityExtractor: class {
    extract = mockExtract;
  },
}));

/**
 * Scope inference behaviour. Default returns a single rule-derived scope;
 * tests override to exercise the empty / blocked paths.
 */
type MockScopeInference = {
  scopes: string[];
  source: 'explicit' | 'rules' | 'llm' | 'fallback';
  confidence: number;
};
const mockInfer = vi.fn<() => Promise<MockScopeInference>>(async () => ({
  scopes: ['personal.notes'],
  source: 'rules',
  confidence: 0.9,
}));

vi.mock('../../ingest/scope-inference.js', () => ({
  createScopeInferenceService: () => ({ infer: mockInfer }),
}));

vi.mock('../../../core/settings/service.js', () => ({
  getSettingValue: <T extends string | number>(_key: string, fallback: T): T => fallback,
}));

// --- Dynamic imports AFTER mocks ---

const { handleCerebrumIngest } = await import('../ingest.js');
const { handleCerebrumQuickCapture } = await import('../quick-capture.js');
const { resetCerebrumCache } = await import('../../instance.js');
const { parseResult } = await import('./test-helpers.js');

// ---------------------------------------------------------------------------
// Test scaffolding
// ---------------------------------------------------------------------------

let rawDb: Database;
let tmpEngramRoot: string;

beforeEach(() => {
  vi.clearAllMocks();
  enqueued.length = 0;

  rawDb = createTestDb();
  testDrizzle = drizzle(rawDb);

  tmpEngramRoot = join(
    tmpdir(),
    `pops-agent-ingest-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(tmpEngramRoot, { recursive: true });
  process.env['ENGRAM_ROOT'] = tmpEngramRoot;
  resetCerebrumCache();

  // Restore default mock behaviours (cleared above).
  mockClassify.mockImplementation(async () => ({
    type: 'note',
    confidence: 0.95,
    template: null,
    suggestedTags: ['cli-suggested'],
  }));
  mockExtract.mockImplementation(async () => ({
    entities: [
      { type: 'person' as const, value: 'Alice', normalised: 'alice', confidence: 0.9 },
      { type: 'project' as const, value: 'POPS', normalised: 'pops', confidence: 0.85 },
    ],
    tags: ['person:alice', 'project:pops'],
    referencedDates: [],
  }));
  mockInfer.mockImplementation(async () => ({
    scopes: ['personal.notes'],
    source: 'rules',
    confidence: 0.9,
  }));
});

afterEach(() => {
  rawDb.close();
  rmSync(tmpEngramRoot, { recursive: true, force: true });
  delete process.env['ENGRAM_ROOT'];
  resetCerebrumCache();
});

interface ParsedIngest {
  engram: {
    id: string;
    title: string;
    type: string;
    scopes: string[];
    filePath: string;
  };
}

// ---------------------------------------------------------------------------
// cerebrum.ingest — full agent pipeline
// ---------------------------------------------------------------------------

describe('agent ingest path — cerebrum.ingest', () => {
  it('runs classification + entity extraction + scope inference + write end-to-end', async () => {
    const result = await handleCerebrumIngest({
      body: 'Alice mentioned the POPS project status during standup today.',
    });

    expect(result.isError).toBeUndefined();

    // Every pipeline stage was exercised by the agent path.
    expect(mockClassify).toHaveBeenCalledTimes(1);
    expect(mockExtract).toHaveBeenCalledTimes(1);
    expect(mockInfer).toHaveBeenCalledTimes(1);

    const parsed = parseResult(result) as ParsedIngest;
    expect(parsed.engram.id).toMatch(/^eng_\d{8}_\d{4}_/);
    expect(parsed.engram.type).toBe('note');
    expect(parsed.engram.scopes).toContain('personal.notes');

    // File written to disk and content preserved.
    const content = readFileSync(join(tmpEngramRoot, parsed.engram.filePath), 'utf8');
    expect(content).toContain('POPS project status');
    expect(content).toContain('source: agent');

    // Tags merged from entity extraction + classifier suggestions.
    expect(content).toContain('person:alice');
    expect(content).toContain('project:pops');
    expect(content).toContain('cli-suggested');

    // Index row materialised.
    const row = rawDb
      .prepare('SELECT id, type FROM engram_index WHERE id = ?')
      .get(parsed.engram.id) as { id: string; type: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.type).toBe('note');
  });

  it('skips classification when type is explicitly provided', async () => {
    const result = await handleCerebrumIngest({
      body: 'A meeting transcript with action items.',
      type: 'meeting',
      scopes: ['work.standups'],
    });

    expect(result.isError).toBeUndefined();
    expect(mockClassify).not.toHaveBeenCalled();
    // Scopes were explicit; the scope-inference service still runs but
    // surfaces the caller's explicit scopes as the result.
    expect(mockInfer).toHaveBeenCalledTimes(1);

    const parsed = parseResult(result) as ParsedIngest;
    expect(parsed.engram.type).toBe('meeting');
  });

  it('extracts JSON metadata into customFields (frontmatter)', async () => {
    const result = await handleCerebrumIngest({
      body: JSON.stringify({
        title: 'Q1 Review',
        priority: 4,
        owner: 'alice',
        followups: ['next-quarter', 'budget'],
      }),
    });

    expect(result.isError).toBeUndefined();
    const parsed = parseResult(result) as ParsedIngest;

    const content = readFileSync(join(tmpEngramRoot, parsed.engram.filePath), 'utf8');
    // JSON preserved as a code block in the body.
    expect(content).toContain('```json');
    expect(content).toContain('Q1 Review');
    // Scalar metadata fields promoted to frontmatter customFields.
    expect(content).toContain('priority: 4');
    expect(content).toContain('owner: alice');
    expect(content).toContain('followups:');
  });

  it('returns VALIDATION_ERROR for empty body without invoking the pipeline', async () => {
    const result = await handleCerebrumIngest({ body: '   ' });

    expect(result.isError).toBe(true);
    expect(mockClassify).not.toHaveBeenCalled();
    expect(mockExtract).not.toHaveBeenCalled();
    expect(mockInfer).not.toHaveBeenCalled();
    const parsed = parseResult(result) as { code: string };
    expect(parsed.code).toBe('VALIDATION_ERROR');
  });

  it('falls back to capture type when classification confidence is low', async () => {
    mockClassify.mockImplementationOnce(async () => ({
      type: 'capture',
      confidence: 0.1,
      template: null,
      suggestedTags: [],
    }));

    const result = await handleCerebrumIngest({ body: 'ambiguous content' });
    const parsed = parseResult(result) as ParsedIngest;
    expect(parsed.engram.type).toBe('capture');
  });

  it('surfaces ValidationError from the engram service as VALIDATION_ERROR', async () => {
    // When scope inference produces nothing AND no rule-engine fallback is
    // available, `createEngram` throws ValidationError("at least one scope is
    // required"). The agent path must surface that as a structured tool
    // error instead of a generic 500.
    mockInfer.mockImplementationOnce(async () => ({
      scopes: [],
      source: 'fallback',
      confidence: 0,
    }));

    // Disable the rule-engine fallback so the empty scopes propagate.
    const { getScopeRuleEngine } = await import('../../instance.js');
    vi.spyOn(getScopeRuleEngine(), 'inferScopes').mockReturnValue([]);

    const result = await handleCerebrumIngest({
      body: 'content with no derivable scope',
    });

    expect(result.isError).toBe(true);
    const parsed = parseResult(result) as { code: string; error: string };
    expect(parsed.code).toBe('VALIDATION_ERROR');
    // ValidationError.message is a generic "Validation failed"; the per-error
    // detail lives in HttpError.details. Asserting the code alone is enough to
    // prove the service error was mapped through the structured-error path.
  });

  it('does NOT use the quickCapture path for full ingest', async () => {
    await handleCerebrumIngest({ body: 'should run full pipeline' });
    // Full ingest never enqueues a classify job (that's the quickCapture
    // contract). If this fails, someone has wired the wrong service.
    expect(enqueued).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// cerebrum.ingest — preview shape (delegates to IngestService.preview through
// the pipeline; we verify the preview-friendly stage outputs are wired)
// ---------------------------------------------------------------------------

describe('agent ingest path — preview (tRPC shape)', () => {
  it('IngestService.preview returns the parsed shape without writing', async () => {
    const { IngestService } = await import('../../ingest/pipeline.js');
    const svc = new IngestService();
    const preview = await svc.preview({
      body: 'Alice presented the POPS roadmap.',
      source: 'agent',
    });

    expect(preview.normalisedBody).toContain('Alice presented the POPS roadmap.');
    expect(preview.classification?.type).toBe('note');
    expect(preview.entities.length).toBeGreaterThan(0);
    expect(preview.scopeInference.scopes).toEqual(['personal.notes']);

    // No file persisted — the engram_index table should be empty.
    const count = rawDb.prepare('SELECT COUNT(*) AS n FROM engram_index').get() as { n: number };
    expect(count.n).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// cerebrum.quickCapture — agent path with async enrichment
// ---------------------------------------------------------------------------

describe('agent ingest path — cerebrum.quickCapture', () => {
  it('persists a capture engram and enqueues an async classification job', async () => {
    const result = await handleCerebrumQuickCapture({
      text: 'fleeting thought about agent routing',
      source: 'agent',
    });

    expect(result.isError).toBeUndefined();
    const parsed = parseResult(result) as {
      engram: { id: string; type: string; scopes: string[]; filePath: string };
    };

    expect(parsed.engram.id).toMatch(/^eng_\d{8}_\d{4}_/);
    expect(parsed.engram.type).toBe('capture');
    expect(parsed.engram.scopes.length).toBeGreaterThan(0);

    // File materialised on disk with source=agent.
    const content = readFileSync(join(tmpEngramRoot, parsed.engram.filePath), 'utf8');
    expect(content).toContain('source: agent');
    expect(content).toContain('fleeting thought');

    // Async enrichment job was enqueued for the new engram.
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]!.engramId).toBe(parsed.engram.id);

    // Quick capture bypasses the synchronous pipeline stages.
    expect(mockClassify).not.toHaveBeenCalled();
    expect(mockExtract).not.toHaveBeenCalled();
  });

  it('returns VALIDATION_ERROR for empty text', async () => {
    const result = await handleCerebrumQuickCapture({ text: '   ' });
    expect(result.isError).toBe(true);
    const parsed = parseResult(result) as { code: string };
    expect(parsed.code).toBe('VALIDATION_ERROR');
    expect(enqueued).toHaveLength(0);
  });
});
