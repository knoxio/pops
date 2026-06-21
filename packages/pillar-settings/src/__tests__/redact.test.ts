import { describe, expect, it } from 'vitest';

import { REDACTED, redactSensitive, redactSensitiveMap } from '../redact.js';

describe('redactSensitive', () => {
  const sensitive = new Set(['plex_token', 'finance.apiToken']);

  it('masks sensitive rows to the sentinel and leaves others intact', () => {
    const rows = [
      { key: 'plex_url', value: 'http://plex.local' },
      { key: 'plex_token', value: 'super-secret-ciphertext' },
      { key: 'finance.apiToken', value: 'tok_live_123' },
    ];
    expect(redactSensitive(rows, sensitive)).toEqual([
      { key: 'plex_url', value: 'http://plex.local' },
      { key: 'plex_token', value: REDACTED },
      { key: 'finance.apiToken', value: REDACTED },
    ]);
  });

  it('does not mutate the input rows', () => {
    const rows = [{ key: 'plex_token', value: 'secret' }];
    redactSensitive(rows, sensitive);
    expect(rows[0]?.value).toBe('secret');
  });

  it('returns an empty array unchanged', () => {
    expect(redactSensitive([], sensitive)).toEqual([]);
  });
});

describe('redactSensitiveMap', () => {
  const sensitive = new Set(['secret']);

  it('masks sensitive entries in a key→value map', () => {
    expect(redactSensitiveMap({ public: 'v', secret: 'hidden' }, sensitive)).toEqual({
      public: 'v',
      secret: REDACTED,
    });
  });

  it('does not mutate the input map', () => {
    const input = { secret: 'hidden' };
    redactSensitiveMap(input, sensitive);
    expect(input.secret).toBe('hidden');
  });
});
