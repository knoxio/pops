import { describe, expect, it, vi } from 'vitest';

import { handleJsonBody } from '../ingest.js';
import { parseResult } from './test-helpers.js';

/**
 * Captured arguments from the most recent IngestService method calls. The
 * mock writes here so individual tests can assert exactly what reached the
 * pipeline (title, customFields, source, etc.) without exposing the mock
 * class outside this scope.
 */
const lastSubmit: { input?: Record<string, unknown> } = {};
const lastQuickCapture: { text?: string; source?: string } = {};

// Mock the IngestService to avoid DB dependency in unit tests
vi.mock('../../ingest/pipeline.js', () => ({
  IngestService: class MockIngestService {
    async submit(input: Record<string, unknown>) {
      lastSubmit.input = input;
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
    async quickCapture(text: string, source: string) {
      lastQuickCapture.text = text;
      lastQuickCapture.source = source;
      return {
        id: 'eng_20260427_1200_capture',
        path: 'personal/capture/eng_20260427_1200_capture.md',
        type: 'capture',
        scopes: ['personal.captures'],
      };
    }
  },
}));

// Dynamic import of handler AFTER mock is set up
const { handleCerebrumIngest, handleCerebrumQuickCapture } = await import('../ingest.js');

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

  it('extracts scalar JSON fields into extractedFields', () => {
    const json = '{"priority": 3, "active": true, "owner": "alice", "title": "T"}';
    const result = handleJsonBody(json);
    expect(result.extractedFields).toEqual({
      priority: 3,
      active: true,
      owner: 'alice',
    });
  });

  it('promotes scalar arrays to extractedFields', () => {
    const json = '{"tags_seen": ["a", "b", "c"], "counts": [1, 2, 3]}';
    const result = handleJsonBody(json);
    expect(result.extractedFields).toEqual({
      tags_seen: ['a', 'b', 'c'],
      counts: [1, 2, 3],
    });
  });

  it('skips nested object values in extractedFields', () => {
    const json = '{"meta": {"nested": true}, "level": "high"}';
    const result = handleJsonBody(json);
    expect(result.extractedFields).toEqual({ level: 'high' });
    expect(result.extractedFields['meta']).toBeUndefined();
  });

  it('skips reserved keys (title/name/body/content) in extractedFields', () => {
    const json =
      '{"title": "t", "name": "n", "body": "b", "content": "c", "text": "x", "other": "keep"}';
    const result = handleJsonBody(json);
    expect(result.extractedFields).toEqual({ other: 'keep' });
  });

  it('returns empty extractedFields for arrays', () => {
    const json = '[1, 2, 3]';
    const result = handleJsonBody(json);
    expect(result.extractedFields).toEqual({});
  });

  it('returns empty extractedFields for non-JSON content', () => {
    const result = handleJsonBody('plain text');
    expect(result.extractedFields).toEqual({});
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

  it('forwards source=agent and full args to IngestService.submit', async () => {
    lastSubmit.input = undefined;
    await handleCerebrumIngest({
      body: 'agent body',
      title: 'Agent Title',
      type: 'note',
      scopes: ['personal'],
      tags: ['t1', 't2'],
    });
    expect(lastSubmit.input).toMatchObject({
      body: 'agent body',
      title: 'Agent Title',
      type: 'note',
      scopes: ['personal'],
      tags: ['t1', 't2'],
      source: 'agent',
    });
  });

  it('promotes JSON metadata into customFields', async () => {
    lastSubmit.input = undefined;
    await handleCerebrumIngest({
      body: '{"title": "Doc", "priority": 5, "owner": "alice"}',
    });
    expect(lastSubmit.input?.['customFields']).toEqual({
      priority: 5,
      owner: 'alice',
    });
  });

  it('does not pass customFields when JSON object has no extractable scalars', async () => {
    lastSubmit.input = undefined;
    await handleCerebrumIngest({ body: '{"title": "Only Title"}' });
    expect(lastSubmit.input?.['customFields']).toBeUndefined();
  });

  it('returns the engram id, file path, type, and scopes from submit', async () => {
    const result = await handleCerebrumIngest({ body: 'hello' });
    const parsed = parseResult(result) as {
      engram: { id: string; type: string; scopes: string[]; filePath: string };
    };
    expect(parsed.engram.id).toBe('eng_20260427_1200_test');
    expect(parsed.engram.filePath).toBe('personal/note/eng_20260427_1200_test.md');
    expect(parsed.engram.type).toBe('note');
    expect(parsed.engram.scopes).toEqual(['personal']);
  });
});

describe('handleCerebrumQuickCapture', () => {
  it('returns VALIDATION_ERROR for empty text', async () => {
    const result = await handleCerebrumQuickCapture({ text: '   ' });
    const parsed = parseResult(result) as { code: string };
    expect(parsed.code).toBe('VALIDATION_ERROR');
    expect(result.isError).toBe(true);
  });

  it('returns VALIDATION_ERROR for missing text', async () => {
    const result = await handleCerebrumQuickCapture({});
    const parsed = parseResult(result) as { code: string };
    expect(parsed.code).toBe('VALIDATION_ERROR');
  });

  it('delegates to IngestService.quickCapture with source=agent', async () => {
    lastQuickCapture.text = undefined;
    lastQuickCapture.source = undefined;
    await handleCerebrumQuickCapture({ text: 'a quick thought' });
    expect(lastQuickCapture.text).toBe('a quick thought');
    expect(lastQuickCapture.source).toBe('agent');
  });

  it('returns the captured engram id, path, type, and scopes', async () => {
    const result = await handleCerebrumQuickCapture({ text: 'quick' });
    expect(result.isError).toBeUndefined();
    const parsed = parseResult(result) as {
      engram: { id: string; type: string; scopes: string[]; filePath: string };
    };
    expect(parsed.engram.id).toBe('eng_20260427_1200_capture');
    expect(parsed.engram.type).toBe('capture');
    expect(parsed.engram.scopes).toEqual(['personal.captures']);
    expect(parsed.engram.filePath).toBe('personal/capture/eng_20260427_1200_capture.md');
  });
});
