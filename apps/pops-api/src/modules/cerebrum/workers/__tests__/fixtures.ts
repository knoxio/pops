/**
 * Shared test fixtures for curation worker tests.
 */
import { vi } from 'vitest';

import type { Engram } from '../../engrams/types.js';
import type { RetrievalResult } from '../../retrieval/types.js';
import type { GliaAction } from '../types.js';

const ENGRAM_DEFAULTS: Engram = {
  id: 'eng_20260101_1200_test',
  type: 'note',
  scopes: ['personal.notes'],
  tags: [],
  links: [],
  created: '2026-01-01T12:00:00Z',
  modified: '2026-01-01T12:00:00Z',
  source: 'manual',
  status: 'active',
  template: null,
  title: 'Test Engram',
  filePath: 'personal/notes/test.md',
  contentHash: 'hash123',
  wordCount: 100,
  customFields: {},
};

/** Build a mock engram with sensible defaults. */
export function makeEngram(overrides: Partial<Engram> = {}): Engram {
  return { ...ENGRAM_DEFAULTS, ...overrides };
}

/** Build a mock RetrievalResult. */
export function makeRetrievalResult(overrides: Partial<RetrievalResult> = {}): RetrievalResult {
  return {
    sourceType: overrides.sourceType ?? 'engram',
    sourceId: overrides.sourceId ?? 'eng_20260101_1200_test',
    title: overrides.title ?? 'Test Result',
    contentPreview: overrides.contentPreview ?? 'preview...',
    score: overrides.score ?? 0.9,
    matchType: overrides.matchType ?? 'semantic',
    metadata: overrides.metadata ?? {},
  };
}

/** Fixed date for deterministic tests. */
export const TEST_NOW = new Date('2026-04-27T10:00:00Z');

interface MockEngramService {
  list: ReturnType<typeof vi.fn>;
  read: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  archive: ReturnType<typeof vi.fn>;
  link: ReturnType<typeof vi.fn>;
  unlink: ReturnType<typeof vi.fn>;
  reindex: ReturnType<typeof vi.fn>;
}

/** Create a mock EngramService. */
export function mockEngramService(): MockEngramService {
  return {
    list: vi.fn().mockReturnValue({ engrams: [], total: 0 }),
    read: vi.fn().mockReturnValue({ engram: makeEngram(), body: 'Test body content' }),
    create: vi.fn().mockReturnValue(makeEngram({ id: 'eng_20260427_1000_merged' })),
    update: vi.fn().mockReturnValue(makeEngram()),
    archive: vi.fn().mockReturnValue(makeEngram({ status: 'archived' })),
    link: vi.fn(),
    unlink: vi.fn(),
    reindex: vi.fn().mockReturnValue({ indexed: 0 }),
  };
}

interface MockSearchService {
  hybrid: ReturnType<typeof vi.fn>;
  semanticSearch: ReturnType<typeof vi.fn>;
  structuredOnly: ReturnType<typeof vi.fn>;
  similar: ReturnType<typeof vi.fn>;
}

/** Create a mock HybridSearchService. */
export function mockSearchService(): MockSearchService {
  return {
    hybrid: vi.fn().mockResolvedValue([]),
    semanticSearch: vi.fn().mockResolvedValue([]),
    structuredOnly: vi.fn().mockReturnValue([]),
    similar: vi.fn().mockResolvedValue([]),
  };
}

/**
 * Narrow a GliaAction payload to a specific type.
 * Type-safe alternative — asserts the discriminant at runtime.
 */
export function narrowPayload<T extends { type: string }>(
  action: GliaAction,
  expectedType: T['type']
): T {
  const payload = action.payload;
  if (payload['type'] !== expectedType) {
    throw new Error(`Expected payload type '${expectedType}', got '${String(payload['type'])}'`);
  }
  return payload as T;
}
