import { describe, expect, it } from 'vitest';

import { ContextAssemblyService } from './context-assembly.js';

import type { RetrievalResult } from './types.js';

function makeResult(sourceId: string, overrides: Partial<RetrievalResult> = {}): RetrievalResult {
  return {
    sourceType: 'engram',
    sourceId,
    title: `Engram ${sourceId}`,
    contentPreview: 'Some content here.',
    score: 0.9,
    matchType: 'semantic',
    metadata: {},
    ...overrides,
  };
}

describe('ContextAssemblyService', () => {
  const svc = new ContextAssemblyService();

  it('returns preamble with query when results are empty', () => {
    const out = svc.assemble({ query: 'hello world', results: [] });
    expect(out.context).toContain('Query: hello world');
    expect(out.sources).toHaveLength(0);
    expect(out.truncated).toBe(false);
    expect(out.tokenEstimate).toBeGreaterThan(0);
  });

  it('includes result sections in context', () => {
    const results = [makeResult('e1', { title: 'My Note', contentPreview: 'Body text.' })];
    const out = svc.assemble({ query: 'q', results, includeMetadata: false });
    expect(out.context).toContain('[engram:e1] My Note');
    expect(out.context).toContain('Body text.');
    expect(out.sources).toHaveLength(1);
    expect(out.sources[0]?.sourceId).toBe('e1');
    expect(out.sources[0]?.relevanceScore).toBe(0.9);
  });

  it('deduplicates results by contentHash', () => {
    const results = [
      makeResult('e1', { metadata: { contentHash: 'abc' } }),
      makeResult('e2', { metadata: { contentHash: 'abc' } }),
    ];
    const out = svc.assemble({ query: 'q', results, includeMetadata: false });
    expect(out.sources).toHaveLength(1);
    expect(out.sources[0]?.sourceId).toBe('e1');
  });

  it('deduplicates results by source identity when no contentHash', () => {
    const results = [makeResult('e1'), makeResult('e1')];
    const out = svc.assemble({ query: 'q', results, includeMetadata: false });
    expect(out.sources).toHaveLength(1);
  });

  it('truncates long content when token budget is tight', () => {
    const longContent = 'word '.repeat(300);
    const results = [makeResult('e1', { contentPreview: longContent })];
    const out = svc.assemble({ query: 'q', results, tokenBudget: 50, includeMetadata: false });
    expect(out.truncated).toBe(true);
    expect(out.context).toContain('[truncated]');
  });

  it('stops adding results when budget is exhausted', () => {
    const results = [
      makeResult('e1', { contentPreview: 'word '.repeat(200) }),
      makeResult('e2', { contentPreview: 'word '.repeat(200) }),
    ];
    const out = svc.assemble({ query: 'q', results, tokenBudget: 100, includeMetadata: false });
    expect(out.sources.length).toBeLessThan(2);
  });

  it('handles budget so small even truncated result does not fit', () => {
    const results = [makeResult('e1', { contentPreview: 'word '.repeat(100) })];
    const out = svc.assemble({ query: 'q', results, tokenBudget: 3, includeMetadata: false });
    expect(out.truncated || out.sources.length === 0).toBe(true);
  });

  it('includes metadata fields when includeMetadata is true', () => {
    const results = [
      makeResult('e1', {
        metadata: { type: 'note', scopes: ['personal'], tags: ['important'] },
      }),
    ];
    const out = svc.assemble({ query: 'q', results, includeMetadata: true });
    expect(out.context).toContain('type: note');
    expect(out.context).toContain('scopes: personal');
    expect(out.context).toContain('tags: important');
  });

  it('omits metadata line when includeMetadata is false', () => {
    const results = [makeResult('e1', { metadata: { type: 'note', scopes: ['personal'] } })];
    const out = svc.assemble({ query: 'q', results, includeMetadata: false });
    expect(out.context).not.toContain('type: note');
  });

  it('tokenEstimate increases with more results', () => {
    const r1 = svc.assemble({ query: 'q', results: [makeResult('e1')] });
    const r2 = svc.assemble({ query: 'q', results: [makeResult('e1'), makeResult('e2')] });
    expect(r2.tokenEstimate).toBeGreaterThan(r1.tokenEstimate);
  });
});
