import { describe, expect, it } from 'vitest';

import {
  backfillDedupeKey,
  foodRowToInferenceRecord,
  type AiInferenceLogRow,
} from '../backfill-mapping.js';

function row(overrides: Partial<AiInferenceLogRow> = {}): AiInferenceLogRow {
  return {
    id: 7,
    provider: 'claude',
    model: 'claude-haiku-4-5-20251001',
    operation: 'recipe-extract-web-llm',
    domain: 'food',
    inputTokens: 1200,
    outputTokens: 400,
    costUsd: 0.0008,
    latencyMs: 950,
    status: 'success',
    cached: 0,
    contextId: 'ingest_source:42',
    errorMessage: null,
    metadata: JSON.stringify({ prompt_version: 'web-llm-v1.0' }),
    createdAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('foodRowToInferenceRecord', () => {
  it('maps the core columns and forces domain=food', () => {
    const record = foodRowToInferenceRecord(row());
    expect(record).toMatchObject({
      provider: 'claude',
      model: 'claude-haiku-4-5-20251001',
      operation: 'recipe-extract-web-llm',
      domain: 'food',
      inputTokens: 1200,
      outputTokens: 400,
      costUsd: 0.0008,
      latencyMs: 950,
      status: 'success',
      cached: false,
      contextId: 'ingest_source:42',
    });
  });

  it('stamps a stable dedupe key + backfilled_from and preserves prior metadata', () => {
    const record = foodRowToInferenceRecord(row({ id: 99 }));
    expect(record.metadata).toMatchObject({
      prompt_version: 'web-llm-v1.0',
      backfilled_from: 'food',
      dedupe_key: 'food:ai_inference_log:99',
    });
    expect(backfillDedupeKey(99)).toBe('food:ai_inference_log:99');
  });

  it('is deterministic — the same row maps to a byte-identical record', () => {
    const a = JSON.stringify(foodRowToInferenceRecord(row({ id: 5 })));
    const b = JSON.stringify(foodRowToInferenceRecord(row({ id: 5 })));
    expect(a).toBe(b);
  });

  it('maps cached=1 to true', () => {
    expect(foodRowToInferenceRecord(row({ cached: 1 })).cached).toBe(true);
  });

  it('passes through error rows with the message capped at 1000 chars', () => {
    const long = 'x'.repeat(2000);
    const record = foodRowToInferenceRecord(
      row({ status: 'error', errorMessage: long, inputTokens: 0, outputTokens: 0 })
    );
    expect(record.status).toBe('error');
    expect(record.errorMessage).toHaveLength(1000);
  });

  it('omits a contextId containing whitespace (ai ingest PII guard) instead of failing', () => {
    const record = foodRowToInferenceRecord(row({ contextId: 'has space here' }));
    expect(record.contextId).toBeUndefined();
  });

  it('omits a contextId longer than 128 chars', () => {
    const record = foodRowToInferenceRecord(row({ contextId: 'a'.repeat(200) }));
    expect(record.contextId).toBeUndefined();
  });

  it('omits a null contextId', () => {
    const record = foodRowToInferenceRecord(row({ contextId: null }));
    expect(record.contextId).toBeUndefined();
  });

  it('tolerates malformed metadata JSON by falling back to an empty object', () => {
    const record = foodRowToInferenceRecord(row({ metadata: '{not json' }));
    expect(record.metadata).toEqual({
      backfilled_from: 'food',
      dedupe_key: 'food:ai_inference_log:7',
    });
  });

  it('tolerates a null metadata column', () => {
    const record = foodRowToInferenceRecord(row({ metadata: null }));
    expect(record.metadata).toMatchObject({ backfilled_from: 'food' });
  });

  it('normalises an unknown status to success', () => {
    expect(foodRowToInferenceRecord(row({ status: 'weird' })).status).toBe('success');
  });

  it('keeps timeout/budget-blocked statuses intact', () => {
    expect(foodRowToInferenceRecord(row({ status: 'timeout' })).status).toBe('timeout');
    expect(foodRowToInferenceRecord(row({ status: 'budget-blocked' })).status).toBe(
      'budget-blocked'
    );
  });
});
