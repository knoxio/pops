import { describe, expect, it } from 'vitest';

import { parseFrame } from '../ha-frame.js';

describe('parseFrame', () => {
  const payload = { type: 'auth_required', ha_version: '2025.10.1' };
  const text = JSON.stringify(payload);

  it('parses a plain string payload', () => {
    expect(parseFrame(text)).toEqual(payload);
  });

  it('parses a Node Buffer payload', () => {
    expect(parseFrame(Buffer.from(text, 'utf8'))).toEqual(payload);
  });

  it('parses an ArrayBuffer payload', () => {
    const buf = Buffer.from(text, 'utf8');
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    expect(parseFrame(ab)).toEqual(payload);
  });

  it('parses a Uint8Array payload', () => {
    const bytes = new Uint8Array(Buffer.from(text, 'utf8'));
    expect(parseFrame(bytes)).toEqual(payload);
  });

  it('parses a Uint8Array view that is a slice of a larger ArrayBuffer', () => {
    const full = Buffer.from(`xx${text}yy`, 'utf8');
    const view = new Uint8Array(full.buffer, full.byteOffset + 2, text.length);
    expect(parseFrame(view)).toEqual(payload);
  });

  it('parses a fragmented Buffer[] payload by concatenating chunks', () => {
    const split = Math.floor(text.length / 2);
    const chunks = [
      Buffer.from(text.slice(0, split), 'utf8'),
      Buffer.from(text.slice(split), 'utf8'),
    ];
    expect(parseFrame(chunks)).toEqual(payload);
  });

  it('returns undefined for unknown payload shapes', () => {
    expect(parseFrame(42)).toBeUndefined();
    expect(parseFrame(undefined)).toBeUndefined();
    expect(parseFrame({ already: 'object' })).toBeUndefined();
  });

  it('returns undefined when JSON is malformed', () => {
    expect(parseFrame('not json')).toBeUndefined();
    expect(parseFrame(Buffer.from('also not json'))).toBeUndefined();
  });
});
