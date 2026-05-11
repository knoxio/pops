import { describe, expect, it, vi } from 'vitest';

import { handleJsonBody } from '../ingest.js';
import { parseResult } from './test-helpers.js';

// Spy that records the last `submit` argument so we can assert what the
// handler forwarded to the IngestService.
const submitCalls: Record<string, unknown>[] = [];

// Mock the IngestService to avoid DB dependency in unit tests
vi.mock('../../ingest/pipeline.js', () => ({
  IngestService: class MockIngestService {
    async submit(input: Record<string, unknown>) {
      submitCalls.push(input);
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

describe('handleCerebrumIngest — JSON metadata extraction (PRD-081 US-02 AC #7)', () => {
  it('lifts type/scopes/tags from a JSON body when the caller omits them', async () => {
    submitCalls.length = 0;
    const json = JSON.stringify({
      title: 'Sprint review',
      type: 'meeting',
      scopes: ['work.sprint'],
      tags: ['retro'],
      attendees: ['alice', 'bob'],
      decisions: ['ship friday'],
    });
    await handleCerebrumIngest({ body: json });

    const call = submitCalls[0];
    expect(call).toBeDefined();
    expect(call?.['title']).toBe('Sprint review');
    expect(call?.['type']).toBe('meeting');
    expect(call?.['scopes']).toEqual(['work.sprint']);
    expect(call?.['tags']).toEqual(['retro']);
    expect(call?.['customFields']).toEqual({
      attendees: ['alice', 'bob'],
      decisions: ['ship friday'],
    });
  });

  it('caller-supplied fields win over JSON-derived fields', async () => {
    submitCalls.length = 0;
    const json = JSON.stringify({
      title: 'JSON title',
      type: 'meeting',
      scopes: ['work.json'],
      data: 'kept',
    });
    await handleCerebrumIngest({
      body: json,
      title: 'Caller title',
      type: 'note',
      scopes: ['personal'],
    });

    const call = submitCalls[0];
    expect(call?.['title']).toBe('Caller title');
    expect(call?.['type']).toBe('note');
    expect(call?.['scopes']).toEqual(['personal']);
    // Non-native keys still flow through as customFields.
    expect(call?.['customFields']).toEqual({ data: 'kept' });
  });

  it('merges caller-supplied tags with JSON-derived tags, deduping', async () => {
    submitCalls.length = 0;
    const json = JSON.stringify({ tags: ['from-json', 'shared'] });
    await handleCerebrumIngest({
      body: json,
      tags: ['from-caller', 'shared'],
    });

    const call = submitCalls[0];
    expect(call?.['tags']).toEqual(['from-caller', 'shared', 'from-json']);
  });

  it('does not include a customFields key when the JSON has no extra fields', async () => {
    submitCalls.length = 0;
    const json = JSON.stringify({ title: 'Only metadata', tags: ['x'] });
    await handleCerebrumIngest({ body: json });

    const call = submitCalls[0];
    expect(call).not.toHaveProperty('customFields');
  });

  it('non-object JSON (array) contributes no derived metadata', async () => {
    submitCalls.length = 0;
    await handleCerebrumIngest({ body: '[1, 2, 3]' });

    const call = submitCalls[0];
    expect(call).toBeDefined();
    expect(call).not.toHaveProperty('customFields');
    // Body is still wrapped in a fenced code block.
    const forwardedBody = call?.['body'];
    expect(typeof forwardedBody).toBe('string');
    expect((forwardedBody as string).startsWith('```json')).toBe(true);
  });

  it('rejects prototype-pollution keys when lifting JSON into customFields', async () => {
    submitCalls.length = 0;
    // Hand-rolled JSON string — `JSON.stringify` silently drops `__proto__` on
    // an object literal, which would make this test pass for the wrong reason.
    const json =
      '{"data":"kept","__proto__":{"polluted":true},"constructor":{"tampered":true},"prototype":"no"}';
    await handleCerebrumIngest({ body: json });

    const call = submitCalls[0];
    const customFields = call?.['customFields'];
    expect(customFields).toEqual({ data: 'kept' });
    expect(Object.getPrototypeOf({}).polluted).toBeUndefined();
  });

  it('treats blank string args as if the caller omitted them so JSON-derived values surface', async () => {
    submitCalls.length = 0;
    const json = JSON.stringify({
      title: 'JSON title',
      type: 'meeting',
    });
    await handleCerebrumIngest({
      body: json,
      title: '   ',
      type: '',
    });

    const call = submitCalls[0];
    expect(call?.['title']).toBe('JSON title');
    expect(call?.['type']).toBe('meeting');
  });

  it('trims whitespace from JSON-derived scopes/tags', async () => {
    submitCalls.length = 0;
    const json = JSON.stringify({
      scopes: ['  work.sprint  ', ' personal '],
      tags: [' retro ', '  raw'],
    });
    await handleCerebrumIngest({ body: json });

    const call = submitCalls[0];
    expect(call?.['scopes']).toEqual(['work.sprint', 'personal']);
    expect(call?.['tags']).toEqual(['retro', 'raw']);
  });
});
