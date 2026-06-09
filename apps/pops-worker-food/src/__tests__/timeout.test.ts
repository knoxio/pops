import { describe, expect, it } from 'vitest';

import { timeoutResult } from '../worker.js';

describe('timeoutResult', () => {
  it('emits a TimedOut failure carrying the extractor version + timeout seconds', () => {
    const result = timeoutResult('pops-worker-food@1.2.3', 300);
    expect(result).toEqual({
      ok: false,
      errorCode: 'TimedOut',
      errorMessage: 'Job exceeded FOOD_INGEST_TIMEOUT_SEC=300',
      meta: { extractor_version: 'pops-worker-food@1.2.3', stages: {} },
    });
  });
});
