/**
 * Unit tests for the F1 AI categorizer seam. The categorizer is stubbed off:
 * `categorizeWithAi` must honour the return contract (`{ result, usage? }`) and
 * yield `{ result: null }` regardless of the flag in F1 — the flag only gates
 * the (not-yet-wired) F2 implementation, so flipping it on must NOT start
 * suggesting entities or recording usage.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { categorizeWithAi, isAiCategorizerEnabled } from '../ai-stub.js';

const FLAG = 'FINANCE_AI_CATEGORIZER_ENABLED';

afterEach(() => {
  delete process.env[FLAG];
});

describe('ai-stub seam', () => {
  it('is disabled by default', () => {
    delete process.env[FLAG];
    expect(isAiCategorizerEnabled()).toBe(false);
  });

  it('reads the enable flag from the environment', () => {
    process.env[FLAG] = 'true';
    expect(isAiCategorizerEnabled()).toBe(true);
    process.env[FLAG] = 'false';
    expect(isAiCategorizerEnabled()).toBe(false);
  });

  it('returns { result: null } with no usage when disabled', async () => {
    delete process.env[FLAG];
    const out = await categorizeWithAi('SOME RAW ROW', 'batch-1', ['groceries']);
    expect(out.result).toBeNull();
    expect(out.usage).toBeUndefined();
  });

  it('returns { result: null } even when enabled (F1: no real wiring yet)', async () => {
    process.env[FLAG] = 'true';
    const out = await categorizeWithAi('SOME RAW ROW');
    expect(out.result).toBeNull();
    expect(out.usage).toBeUndefined();
  });
});
