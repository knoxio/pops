import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  callContractMismatch,
  callOk,
  callUnavailable,
  extractText,
  mockPillarCerebrum,
  parseResult,
} from './test-helpers.js';

vi.mock('../pillar-client.js', () => ({
  getPillar: () => mockPillarCerebrum,
  __resetPillarClientForTests: () => {},
}));

const { cerebrumTools } = await import('./cerebrum.js');

const engrams = mockPillarCerebrum.cerebrum.engrams;
const retrieval = mockPillarCerebrum.cerebrum.retrieval;

beforeEach(() => {
  vi.clearAllMocks();
  engrams.list.mockResolvedValue(callOk({ engrams: [], total: 0 }));
  engrams.get.mockResolvedValue(callOk({ id: 'eng_1', title: 'Test', body: 'content' }));
  retrieval.search.mockResolvedValue(callOk({ results: [] }));
});

describe('cerebrum.engrams.list', () => {
  const tool = cerebrumTools.find((t) => t.name === 'cerebrum.engrams.list')!;

  it('passes scope and tag arrays correctly', async () => {
    await tool.handler({ scopes: ['work', 'personal'], tags: ['important'] });
    expect(engrams.list).toHaveBeenCalledWith(
      expect.objectContaining({ scopes: ['work', 'personal'], tags: ['important'] })
    );
  });

  it('filters non-string elements from scope and tag arrays', async () => {
    await tool.handler({ scopes: ['valid', 42, null, 'also-valid'] });
    const call = engrams.list.mock.lastCall?.[0];
    expect((call as Record<string, unknown>)['scopes']).toEqual(['valid', 'also-valid']);
  });

  it('ignores invalid status values', async () => {
    await tool.handler({ status: 'deleted' });
    const call = engrams.list.mock.lastCall?.[0];
    expect((call as Record<string, unknown>)['status']).toBeUndefined();
  });

  it('returns isError on unavailable', async () => {
    engrams.list.mockResolvedValueOnce(callUnavailable('cerebrum'));
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });

  it('returns isError on contract-mismatch', async () => {
    engrams.list.mockResolvedValueOnce(callContractMismatch('cerebrum', '1.0.0', '2.0.0'));
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });
});

describe('cerebrum.engrams.get', () => {
  const tool = cerebrumTools.find((t) => t.name === 'cerebrum.engrams.get')!;

  it('calls engrams.get with the id', async () => {
    const result = await tool.handler({ id: 'eng_1' });
    expect(engrams.get).toHaveBeenCalledWith({ id: 'eng_1' });
    expect(result.isError).toBeUndefined();
    const text = extractText(result);
    expect(text).toContain('eng_1');
  });

  it('returns isError for missing id', async () => {
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });

  it('returns isError for empty id', async () => {
    const result = await tool.handler({ id: '' });
    expect(result.isError).toBe(true);
  });

  it('returns isError on unavailable', async () => {
    engrams.get.mockResolvedValueOnce(callUnavailable('cerebrum'));
    const result = await tool.handler({ id: 'eng_1' });
    expect(result.isError).toBe(true);
  });
});

describe('cerebrum.search', () => {
  const tool = cerebrumTools.find((t) => t.name === 'cerebrum.search')!;

  it('calls retrieval.search with query and defaults to hybrid', async () => {
    await tool.handler({ query: 'home automation' });
    expect(retrieval.search).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'home automation', mode: 'hybrid' })
    );
  });

  it('passes explicit mode', async () => {
    await tool.handler({ query: 'test', mode: 'semantic' });
    expect(retrieval.search).toHaveBeenCalledWith(expect.objectContaining({ mode: 'semantic' }));
  });

  it('returns isError for missing query', async () => {
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });

  it('returns isError for blank query', async () => {
    const result = await tool.handler({ query: '   ' });
    expect(result.isError).toBe(true);
  });

  it('returns isError on contract-mismatch', async () => {
    retrieval.search.mockResolvedValueOnce(callContractMismatch('cerebrum', '1.0.0', '2.0.0'));
    const result = await tool.handler({ query: 'test' });
    expect(result.isError).toBe(true);
  });
});

describe('cerebrum tools registry', () => {
  it('result text is valid JSON', async () => {
    const tool = cerebrumTools.find((t) => t.name === 'cerebrum.search')!;
    const result = await tool.handler({ query: 'test' });
    const text = extractText(result);
    expect(() => JSON.parse(text)).not.toThrow();
    const parsed = parseResult(result) as { results: unknown[] };
    expect(parsed.results).toEqual([]);
  });
});
