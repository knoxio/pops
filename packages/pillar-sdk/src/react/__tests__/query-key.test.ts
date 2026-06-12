import { describe, expect, it } from 'vitest';

import { pillarQueryKey } from '../query-key.js';

describe('pillarQueryKey', () => {
  it('places the pillarId and path segments before the serialised input', () => {
    const key = pillarQueryKey('finance', ['wishlist', 'list'], { limit: 10 });
    expect(key[0]).toBe('finance');
    expect(key[1]).toBe('wishlist');
    expect(key[2]).toBe('list');
    expect(key[3]).toBe('{"limit":10}');
  });

  it('produces stable keys regardless of input key order', () => {
    const a = pillarQueryKey('finance', ['wishlist', 'list'], { b: 2, a: 1 });
    const b = pillarQueryKey('finance', ['wishlist', 'list'], { a: 1, b: 2 });
    expect(a).toEqual(b);
  });

  it('recurses into nested objects', () => {
    const a = pillarQueryKey('finance', ['x'], { filter: { b: 2, a: 1 } });
    const b = pillarQueryKey('finance', ['x'], { filter: { a: 1, b: 2 } });
    expect(a).toEqual(b);
  });

  it('serialises undefined input as null', () => {
    const key = pillarQueryKey('finance', ['x'], undefined);
    expect(key[key.length - 1]).toBe('null');
  });

  it('drops undefined values from objects', () => {
    const key = pillarQueryKey('finance', ['x'], { a: 1, b: undefined });
    expect(key[key.length - 1]).toBe('{"a":1}');
  });

  it('preserves array element order', () => {
    const a = pillarQueryKey('finance', ['x'], { ids: ['b', 'a'] });
    const b = pillarQueryKey('finance', ['x'], { ids: ['a', 'b'] });
    expect(a).not.toEqual(b);
  });
});
