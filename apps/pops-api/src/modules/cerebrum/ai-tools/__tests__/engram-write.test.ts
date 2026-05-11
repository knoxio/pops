import { describe, expect, it, vi } from 'vitest';

import { NotFoundError, ValidationError } from '../../../../shared/errors.js';
import { parseResult } from './test-helpers.js';

import type { Engram } from '../../engrams/types.js';

const mockUpdate = vi.fn();

vi.mock('../../instance.js', () => ({
  getEngramService: () => ({
    update: mockUpdate,
  }),
}));

const { handleEngramWrite } = await import('../engram-write.js');

function makeEngram(overrides: Partial<Engram> = {}): Engram {
  return {
    id: 'eng_20260427_1200_test',
    type: 'note',
    scopes: ['personal'],
    tags: ['test'],
    links: [],
    created: '2026-04-27T12:00:00Z',
    modified: '2026-04-27T13:00:00Z',
    source: 'manual',
    status: 'active',
    template: null,
    title: 'Updated Engram',
    filePath: 'personal/note/eng_20260427_1200_test.md',
    contentHash: 'def456',
    wordCount: 50,
    customFields: {},
    ...overrides,
  };
}

describe('handleEngramWrite', () => {
  it('returns VALIDATION_ERROR for empty id', async () => {
    const result = await handleEngramWrite({ id: '', body: 'content' });
    const parsed = parseResult(result);
    expect(parsed).toEqual({ error: 'id is required', code: 'VALIDATION_ERROR' });
    expect(result.isError).toBe(true);
  });

  it('returns VALIDATION_ERROR when no changes are provided', async () => {
    const result = await handleEngramWrite({ id: 'eng_20260427_1200_test' });
    const parsed = parseResult(result);
    expect(parsed).toEqual({
      error: 'at least one field to update must be provided',
      code: 'VALIDATION_ERROR',
    });
    expect(result.isError).toBe(true);
  });

  it('updates body only', async () => {
    const engram = makeEngram();
    mockUpdate.mockReturnValueOnce(engram);

    const result = await handleEngramWrite({
      id: 'eng_20260427_1200_test',
      body: 'New body content',
    });
    const parsed = parseResult(result) as { engram: Record<string, unknown> };

    expect(parsed.engram.id).toBe('eng_20260427_1200_test');
    expect(parsed.engram.modified).toBe('2026-04-27T13:00:00Z');
    expect(result.isError).toBeUndefined();

    expect(mockUpdate).toHaveBeenCalledWith('eng_20260427_1200_test', { body: 'New body content' });
  });

  it('updates title only', async () => {
    mockUpdate.mockReturnValueOnce(makeEngram({ title: 'New Title' }));

    await handleEngramWrite({
      id: 'eng_20260427_1200_test',
      title: 'New Title',
    });

    expect(mockUpdate).toHaveBeenCalledWith('eng_20260427_1200_test', { title: 'New Title' });
  });

  it('updates scopes and tags together', async () => {
    mockUpdate.mockReturnValueOnce(
      makeEngram({ scopes: ['work'], tags: ['meeting', 'important'] })
    );

    await handleEngramWrite({
      id: 'eng_20260427_1200_test',
      scopes: ['work'],
      tags: ['meeting', 'important'],
    });

    expect(mockUpdate).toHaveBeenCalledWith('eng_20260427_1200_test', {
      scopes: ['work'],
      tags: ['meeting', 'important'],
    });
  });

  it('returns only id, title, type, scopes, modified in response', async () => {
    mockUpdate.mockReturnValueOnce(makeEngram());

    const result = await handleEngramWrite({
      id: 'eng_20260427_1200_test',
      body: 'content',
    });
    const parsed = parseResult(result) as { engram: Record<string, unknown> };

    expect(Object.keys(parsed.engram).toSorted()).toEqual(
      ['id', 'modified', 'scopes', 'title', 'type'].toSorted()
    );
  });

  it('maps NotFoundError from service', async () => {
    mockUpdate.mockImplementationOnce(() => {
      throw new NotFoundError('Engram', 'eng_nonexistent');
    });

    const result = await handleEngramWrite({
      id: 'eng_nonexistent',
      body: 'content',
    });
    const parsed = parseResult(result) as { code: string };
    expect(parsed.code).toBe('NOT_FOUND');
    expect(result.isError).toBe(true);
  });

  it('maps ValidationError from service', async () => {
    mockUpdate.mockImplementationOnce(() => {
      throw new ValidationError({ message: 'invalid status transition' });
    });

    const result = await handleEngramWrite({
      id: 'eng_20260427_1200_test',
      body: 'content',
    });
    const parsed = parseResult(result) as { code: string };
    expect(parsed.code).toBe('VALIDATION_ERROR');
    expect(result.isError).toBe(true);
  });

  it('filters non-string values from scopes and tags', async () => {
    mockUpdate.mockReturnValueOnce(makeEngram());

    await handleEngramWrite({
      id: 'eng_20260427_1200_test',
      scopes: ['valid', 123, null] as unknown as string[],
      tags: ['tag1', false, 'tag2'] as unknown as string[],
    });

    expect(mockUpdate).toHaveBeenCalledWith('eng_20260427_1200_test', {
      scopes: ['valid'],
      tags: ['tag1', 'tag2'],
    });
  });
});
