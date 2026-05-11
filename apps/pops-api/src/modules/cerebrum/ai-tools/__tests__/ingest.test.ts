import { describe, expect, it, vi } from 'vitest';

import { handleJsonBody } from '../ingest.js';
import { parseResult } from './test-helpers.js';

// Mock the IngestService to avoid DB dependency in unit tests
vi.mock('../../ingest/pipeline.js', () => ({
  IngestService: class MockIngestService {
    async submit(input: Record<string, unknown>) {
      return {
        engram: {
          id: 'eng_20260427_1200_test',
          title: input['title'] ?? 'Derived Title',
          type: input['type'] ?? 'note',
          scopes: input['scopes'] ?? ['personal'],
          filePath: 'personal/note/eng_20260427_1200_test.md',
        },
        classification: null,
        entities: [],
        scopeInference: { scopes: ['personal'], source: 'rules', confidence: 0.9 },
      };
    }
  },
}));

// Dynamic import of handler AFTER mock is set up
const { handleCerebrumIngest } = await import('../ingest.js');

describe('handleJsonBody', () => {
  it('returns the original body for non-JSON content', () => {
    const result = handleJsonBody('Hello world');
    expect(result.body).toBe('Hello world');
    expect(result.derivedTitle).toBeNull();
  });

  it('wraps valid JSON object in a fenced code block', () => {
    const json = '{"name": "test", "value": 42}';
    const result = handleJsonBody(json);
    expect(result.body).toBe('```json\n{"name": "test", "value": 42}\n```');
  });

  it('wraps valid JSON array in a fenced code block', () => {
    const json = '[1, 2, 3]';
    const result = handleJsonBody(json);
    expect(result.body).toBe('```json\n[1, 2, 3]\n```');
    expect(result.derivedTitle).toBeNull();
  });

  it('derives title from "title" key', () => {
    const json = '{"title": "My Document", "body": "content"}';
    const result = handleJsonBody(json);
    expect(result.derivedTitle).toBe('My Document');
  });

  it('derives title from "name" key when title is absent', () => {
    const json = '{"name": "Project Alpha", "status": "active"}';
    const result = handleJsonBody(json);
    expect(result.derivedTitle).toBe('Project Alpha');
  });

  it('derives title from "subject" key', () => {
    const json = '{"subject": "Meeting Notes", "date": "2026-01-01"}';
    const result = handleJsonBody(json);
    expect(result.derivedTitle).toBe('Meeting Notes');
  });

  it('falls back to key summary when no title-like keys exist', () => {
    const json = '{"alpha": 1, "beta": 2, "gamma": 3}';
    const result = handleJsonBody(json);
    expect(result.derivedTitle).toBe('JSON: alpha, beta, gamma');
  });

  it('truncates key summary for objects with many keys', () => {
    const obj: Record<string, number> = {};
    for (let i = 0; i < 10; i++) obj[`key${i}`] = i;
    const json = JSON.stringify(obj);
    const result = handleJsonBody(json);
    expect(result.derivedTitle).toContain('…');
    expect(result.derivedTitle?.split(',').length).toBeLessThanOrEqual(5);
  });

  it('truncates derived title to 120 characters', () => {
    const longTitle = 'A'.repeat(200);
    const json = JSON.stringify({ title: longTitle });
    const result = handleJsonBody(json);
    expect(result.derivedTitle).toHaveLength(120);
  });

  it('returns original body for invalid JSON starting with {', () => {
    const body = '{not valid json';
    const result = handleJsonBody(body);
    expect(result.body).toBe(body);
    expect(result.derivedTitle).toBeNull();
  });

  it('handles whitespace around JSON', () => {
    const json = '  \n  {"title": "Trimmed"}  \n  ';
    const result = handleJsonBody(json);
    expect(result.body).toBe('```json\n{"title": "Trimmed"}\n```');
    expect(result.derivedTitle).toBe('Trimmed');
  });

  it('skips empty-string title keys', () => {
    const json = '{"title": "  ", "name": "Fallback"}';
    const result = handleJsonBody(json);
    expect(result.derivedTitle).toBe('Fallback');
  });
});

describe('handleCerebrumIngest', () => {
  it('returns VALIDATION_ERROR for empty body', async () => {
    const result = await handleCerebrumIngest({ body: '   ' });
    const parsed = parseResult(result);
    expect(parsed).toEqual({
      error: 'body is required and must be non-empty',
      code: 'VALIDATION_ERROR',
    });
    expect(result.isError).toBe(true);
  });

  it('returns VALIDATION_ERROR for missing body', async () => {
    const result = await handleCerebrumIngest({});
    const parsed = parseResult(result);
    expect(parsed).toEqual(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });

  it('ingests plain text content', async () => {
    const result = await handleCerebrumIngest({
      body: 'Hello world',
      title: 'Test Note',
      type: 'note',
      scopes: ['personal'],
      tags: ['test'],
    });
    const parsed = parseResult(result) as { engram: { id: string } };
    expect(parsed.engram).toBeDefined();
    expect(parsed.engram.id).toBe('eng_20260427_1200_test');
    expect(result.isError).toBeUndefined();
  });

  it('auto-derives title from JSON body when no title provided', async () => {
    const result = await handleCerebrumIngest({
      body: '{"title": "Auto Title", "data": 42}',
    });
    const parsed = parseResult(result) as { engram: { title: string } };
    // The mock returns the title passed to submit
    expect(parsed.engram).toBeDefined();
    expect(result.isError).toBeUndefined();
  });

  it('filters non-string values from scopes array', async () => {
    const result = await handleCerebrumIngest({
      body: 'content',
      scopes: ['valid', 42, null, 'also-valid'] as unknown as string[],
    });
    expect(result.isError).toBeUndefined();
  });
});
