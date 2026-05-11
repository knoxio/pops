import { describe, expect, it, vi } from 'vitest';

import { NotFoundError } from '../../../../shared/errors.js';
import { parseResult } from './test-helpers.js';

import type { Engram } from '../../engrams/types.js';

const mockRead = vi.fn();

vi.mock('../../instance.js', () => ({
  getEngramService: () => ({
    read: mockRead,
  }),
}));

const { handleEngramRead } = await import('../engram-read.js');

function makeEngram(overrides: Partial<Engram> = {}): Engram {
  return {
    id: 'eng_20260427_1200_test',
    type: 'note',
    scopes: ['personal'],
    tags: ['test'],
    links: [],
    created: '2026-04-27T12:00:00Z',
    modified: '2026-04-27T12:00:00Z',
    source: 'manual',
    status: 'active',
    template: null,
    title: 'Test Engram',
    filePath: 'personal/note/eng_20260427_1200_test.md',
    contentHash: 'abc123',
    wordCount: 42,
    customFields: {},
    ...overrides,
  };
}

describe('handleEngramRead', () => {
  it('returns VALIDATION_ERROR for empty id', async () => {
    const result = await handleEngramRead({ id: '  ' });
    const parsed = parseResult(result);
    expect(parsed).toEqual({ error: 'id is required', code: 'VALIDATION_ERROR' });
    expect(result.isError).toBe(true);
  });

  it('returns VALIDATION_ERROR for missing id', async () => {
    const result = await handleEngramRead({});
    const parsed = parseResult(result);
    expect(parsed).toEqual(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });

  it('returns engram metadata and body for a valid read', async () => {
    const engram = makeEngram();
    mockRead.mockReturnValueOnce({ engram, body: '# Test\n\nSome content here.' });

    const result = await handleEngramRead({ id: 'eng_20260427_1200_test' });
    const parsed = parseResult(result) as { engram: Record<string, unknown>; body: string };

    expect(parsed.engram.id).toBe('eng_20260427_1200_test');
    expect(parsed.engram.title).toBe('Test Engram');
    expect(parsed.engram.type).toBe('note');
    expect(parsed.engram.scopes).toEqual(['personal']);
    expect(parsed.engram.tags).toEqual(['test']);
    expect(parsed.engram.status).toBe('active');
    expect(parsed.body).toBe('# Test\n\nSome content here.');
    expect(result.isError).toBeUndefined();
  });

  it('blocks access when all scopes are secret', async () => {
    const engram = makeEngram({ scopes: ['personal.secret.passwords'] });
    mockRead.mockReturnValueOnce({ engram, body: 'secret stuff' });

    const result = await handleEngramRead({ id: 'eng_20260427_1200_test' });
    const parsed = parseResult(result) as { code: string };
    expect(parsed.code).toBe('SCOPE_BLOCKED');
    expect(result.isError).toBe(true);
  });

  it('allows access when at least one scope is not secret', async () => {
    const engram = makeEngram({ scopes: ['personal.secret.passwords', 'personal.notes'] });
    mockRead.mockReturnValueOnce({ engram, body: 'mixed scope content' });

    const result = await handleEngramRead({ id: 'eng_20260427_1200_test' });
    expect(result.isError).toBeUndefined();
  });

  it('maps NotFoundError from service', async () => {
    mockRead.mockImplementationOnce(() => {
      throw new NotFoundError('Engram', 'eng_nonexistent');
    });

    const result = await handleEngramRead({ id: 'eng_nonexistent' });
    const parsed = parseResult(result) as { code: string };
    expect(parsed.code).toBe('NOT_FOUND');
    expect(result.isError).toBe(true);
  });

  it('does not include filePath, contentHash, wordCount, or customFields in response', async () => {
    const engram = makeEngram();
    mockRead.mockReturnValueOnce({ engram, body: 'content' });

    const result = await handleEngramRead({ id: 'eng_20260427_1200_test' });
    const parsed = parseResult(result) as { engram: Record<string, unknown> };
    expect(parsed.engram).not.toHaveProperty('filePath');
    expect(parsed.engram).not.toHaveProperty('contentHash');
    expect(parsed.engram).not.toHaveProperty('wordCount');
    expect(parsed.engram).not.toHaveProperty('customFields');
  });
});
