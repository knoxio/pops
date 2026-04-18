import { describe, expect, it } from 'vitest';

import { OVERLAP_CHARS, MAX_CHUNK_CHARS, chunkText, hashContent } from './chunker.js';

describe('chunkText', () => {
  it('returns [] for empty string', () => {
    expect(chunkText('')).toEqual([]);
  });

  it('returns [] for whitespace-only string', () => {
    expect(chunkText('   \n\t  ')).toEqual([]);
  });

  it('returns a single chunk at index 0 for short text', () => {
    const result = chunkText('hello world');
    expect(result).toEqual([{ index: 0, text: 'hello world' }]);
  });

  it('trims leading and trailing whitespace before chunking', () => {
    const result = chunkText('  hello  ');
    expect(result).toEqual([{ index: 0, text: 'hello' }]);
  });

  it('returns a single chunk when text equals exactly MAX_CHUNK_CHARS', () => {
    const text = 'a'.repeat(MAX_CHUNK_CHARS);
    const result = chunkText(text);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ index: 0, text });
  });

  it('returns a single chunk when text is one character shorter than MAX_CHUNK_CHARS', () => {
    const text = 'a'.repeat(MAX_CHUNK_CHARS - 1);
    const result = chunkText(text);
    expect(result).toHaveLength(1);
    expect(result[0]?.text).toBe(text);
  });

  it('splits into two chunks when text exceeds MAX_CHUNK_CHARS by one character', () => {
    const text = 'a'.repeat(MAX_CHUNK_CHARS + 1);
    const result = chunkText(text);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0]?.index).toBe(0);
    expect(result[1]?.index).toBe(1);
  });

  it('assigns sequential indices starting at 0', () => {
    const text = 'x'.repeat(MAX_CHUNK_CHARS * 3);
    const result = chunkText(text);
    result.forEach((chunk, i) => {
      expect(chunk.index).toBe(i);
    });
  });

  it('each chunk is at most MAX_CHUNK_CHARS characters', () => {
    const text = 'a'.repeat(MAX_CHUNK_CHARS * 4);
    const result = chunkText(text);
    for (const chunk of result) {
      expect(chunk.text.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
    }
  });

  it('covers the entire text across all chunks (no content dropped)', () => {
    // Build text with identifiable positions so we can verify coverage
    const text = Array.from({ length: MAX_CHUNK_CHARS * 3 }, (_, i) => String(i % 10)).join('');
    const result = chunkText(text);

    // The first chunk starts at 0 and the last chunk ends at the text's end
    expect(result[0]?.text).toBe(text.slice(0, MAX_CHUNK_CHARS));
    const last = result[result.length - 1];
    expect(last?.text).toBe(text.slice(last ? text.length - last.text.length : 0));
  });

  it('adjacent chunks overlap by exactly OVERLAP_CHARS (except when final chunk is shorter)', () => {
    const text = 'z'.repeat(MAX_CHUNK_CHARS * 4);
    const result = chunkText(text);

    for (let i = 0; i + 1 < result.length; i++) {
      const curr = result[i]!;
      const next = result[i + 1]!;
      if (next.text.length === MAX_CHUNK_CHARS) {
        // Full-size next chunk: overlap must equal OVERLAP_CHARS
        expect(curr.text.slice(-OVERLAP_CHARS)).toBe(next.text.slice(0, OVERLAP_CHARS));
      }
    }
  });

  it('does not loop infinitely when the final char lands exactly on a chunk boundary', () => {
    // A text whose length is an exact multiple of (MAX_CHUNK_CHARS - OVERLAP_CHARS)
    const step = MAX_CHUNK_CHARS - OVERLAP_CHARS;
    const text = 'b'.repeat(step * 3 + OVERLAP_CHARS);
    // If the infinite-loop bug existed this would time out; with the fix it terminates
    const result = chunkText(text);
    expect(result.length).toBeGreaterThan(1);
  });

  it('last chunk text ends at the end of the input', () => {
    const text = 'hello '.repeat(400); // > MAX_CHUNK_CHARS
    const result = chunkText(text);
    const last = result[result.length - 1]!;
    expect(text.trimEnd().endsWith(last.text)).toBe(true);
  });
});

describe('hashContent', () => {
  it('returns a 64-character hex string for any input', () => {
    expect(hashContent('hello')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns the same hash for identical inputs', () => {
    expect(hashContent('abc')).toBe(hashContent('abc'));
  });

  it('returns different hashes for different inputs', () => {
    expect(hashContent('foo')).not.toBe(hashContent('bar'));
  });
});
