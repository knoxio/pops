import { describe, expect, it } from 'vitest';

import { InferenceRecordSchema, type InferenceRecord } from '../record-schema.js';

const valid: InferenceRecord = {
  provider: 'anthropic',
  model: 'claude-haiku-4-5',
  operation: 'categorize',
  domain: 'finance',
  inputTokens: 10,
  outputTokens: 5,
  costUsd: 0.001,
  latencyMs: 120,
  status: 'success',
  cached: false,
};

describe('InferenceRecordSchema', () => {
  it('accepts a minimal valid record', () => {
    expect(InferenceRecordSchema.parse(valid)).toMatchObject(valid);
  });

  it('accepts optional contextId/promptVersion/metadata', () => {
    const parsed = InferenceRecordSchema.safeParse({
      ...valid,
      contextId: 'ingest_source:42',
      promptVersion: 'v3',
      metadata: { prompt_version: 'v3' },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an empty provider', () => {
    expect(InferenceRecordSchema.safeParse({ ...valid, provider: '' }).success).toBe(false);
  });

  it('rejects negative or non-integer token counts', () => {
    expect(InferenceRecordSchema.safeParse({ ...valid, inputTokens: -1 }).success).toBe(false);
    expect(InferenceRecordSchema.safeParse({ ...valid, outputTokens: 1.5 }).success).toBe(false);
  });

  it('rejects a contextId containing whitespace (PII guard)', () => {
    expect(InferenceRecordSchema.safeParse({ ...valid, contextId: 'has space' }).success).toBe(
      false
    );
  });

  it('rejects an unknown status', () => {
    expect(InferenceRecordSchema.safeParse({ ...valid, status: 'weird' }).success).toBe(false);
  });

  it('accepts every widened status value', () => {
    for (const status of ['success', 'error', 'timeout', 'budget-blocked'] as const) {
      expect(InferenceRecordSchema.safeParse({ ...valid, status }).success).toBe(true);
    }
  });
});
