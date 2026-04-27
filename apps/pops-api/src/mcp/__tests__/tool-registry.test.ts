import { describe, expect, it, vi } from 'vitest';

// Mock all service dependencies so we can test registry dispatch in isolation
vi.mock('../../db.js', () => ({ getDrizzle: () => ({}) }));
vi.mock('../../modules/cerebrum/retrieval/hybrid-search.js', () => ({
  HybridSearchService: class {
    async hybrid() {
      return [];
    }
  },
}));
vi.mock('../../modules/cerebrum/ingest/pipeline.js', () => ({
  IngestService: class {
    async submit() {
      return {
        engram: { id: 'eng_test', title: 't', type: 'note', scopes: [], filePath: '' },
        classification: null,
        entities: [],
        scopeInference: { scopes: [], source: 'fallback', confidence: 0 },
      };
    }
  },
}));
vi.mock('../../modules/cerebrum/query/query-service.js', () => ({
  QueryService: class {
    async ask() {
      return { answer: 'test', sources: [], scopes: [], confidence: 'low' };
    }
  },
}));
vi.mock('../../modules/cerebrum/instance.js', () => ({
  getEngramService: () => ({
    read: () => ({
      engram: {
        id: 'eng_test',
        title: 't',
        type: 'note',
        scopes: ['personal'],
        tags: [],
        status: 'active',
        created: '2026-01-01T00:00:00Z',
        modified: '2026-01-01T00:00:00Z',
      },
      body: 'content',
    }),
    update: () => ({
      id: 'eng_test',
      title: 't',
      type: 'note',
      scopes: ['personal'],
      modified: '2026-01-01T00:00:00Z',
    }),
  }),
}));

const { dispatchTool, toolDefinitions } = await import('../tools/index.js');

describe('toolDefinitions', () => {
  it('registers exactly 5 tools', () => {
    expect(toolDefinitions).toHaveLength(5);
  });

  it('includes cerebrum.search', () => {
    expect(toolDefinitions.some((t) => t.name === 'cerebrum.search')).toBe(true);
  });

  it('includes cerebrum.ingest', () => {
    expect(toolDefinitions.some((t) => t.name === 'cerebrum.ingest')).toBe(true);
  });

  it('includes cerebrum.engram.read', () => {
    expect(toolDefinitions.some((t) => t.name === 'cerebrum.engram.read')).toBe(true);
  });

  it('includes cerebrum.engram.write', () => {
    expect(toolDefinitions.some((t) => t.name === 'cerebrum.engram.write')).toBe(true);
  });

  it('includes cerebrum.query', () => {
    expect(toolDefinitions.some((t) => t.name === 'cerebrum.query')).toBe(true);
  });

  it('all tools have a description and inputSchema', () => {
    for (const tool of toolDefinitions) {
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema['type']).toBe('object');
    }
  });
});

describe('dispatchTool', () => {
  it('returns null for unknown tool names', () => {
    const result = dispatchTool('cerebrum.nonexistent', {});
    expect(result).toBeNull();
  });

  it('dispatches cerebrum.search and returns a promise', () => {
    const result = dispatchTool('cerebrum.search', { query: 'test' });
    expect(result).toBeInstanceOf(Promise);
  });

  it('dispatches cerebrum.ingest', () => {
    const result = dispatchTool('cerebrum.ingest', { body: 'content' });
    expect(result).toBeInstanceOf(Promise);
  });

  it('dispatches cerebrum.engram.read', () => {
    const result = dispatchTool('cerebrum.engram.read', { id: 'eng_test' });
    expect(result).toBeInstanceOf(Promise);
  });

  it('dispatches cerebrum.engram.write', () => {
    const result = dispatchTool('cerebrum.engram.write', { id: 'eng_test', body: 'new' });
    expect(result).toBeInstanceOf(Promise);
  });

  it('dispatches cerebrum.query', () => {
    const result = dispatchTool('cerebrum.query', { question: 'test' });
    expect(result).toBeInstanceOf(Promise);
  });

  it('cerebrum.search resolves to a valid MCP response', async () => {
    const result = await dispatchTool('cerebrum.search', { query: 'test' });
    expect(result).toBeDefined();
    expect(result?.content).toBeDefined();
    expect(result?.content[0]?.type).toBe('text');
  });
});
