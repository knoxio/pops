/**
 * PRD-130 — dispatcher entry-point tests. Exercises the `runInstagramIngest`
 * shell that lives at `handlers/instagram.ts` and is what the dispatch
 * table registers.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runInstagramIngest } from '../handlers/instagram.js';
import { setAnthropicClient } from '../handlers/instagram/anthropic-client.js';

describe('runInstagramIngest dispatcher', () => {
  const originalKey = process.env['ANTHROPIC_API_KEY'];

  beforeEach(() => {
    setAnthropicClient(null);
  });

  afterEach(() => {
    setAnthropicClient(null);
    if (originalKey === undefined) {
      delete process.env['ANTHROPIC_API_KEY'];
    } else {
      process.env['ANTHROPIC_API_KEY'] = originalKey;
    }
  });

  it('returns MissingApiKey when ANTHROPIC_API_KEY is unset', async () => {
    delete process.env['ANTHROPIC_API_KEY'];
    const result = await runInstagramIngest(
      { kind: 'url-instagram', sourceId: 1, url: 'https://instagram.com/reel/abc' },
      { isCancelled: () => false }
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.errorCode).toBe('MissingApiKey');
  });
});
