import { describe, expect, it } from 'vitest';

import {
  copyNullNum,
  copyNullStr,
  copyOptBool,
  copyOptStr,
  nullNum,
  nullStr,
  ok,
  optBool,
  optNum,
  optStr,
  reqStr,
  toolError,
} from './utils.js';

describe('ok / toolError', () => {
  it('ok wraps JSON-stringified data', () => {
    expect(ok({ a: 1 })).toEqual({ content: [{ type: 'text', text: '{\n  "a": 1\n}' }] });
  });

  it('toolError sets isError and surfaces the message', () => {
    expect(toolError('boom')).toEqual({
      content: [{ type: 'text', text: 'boom' }],
      isError: true,
    });
  });
});

describe('reqStr', () => {
  it('returns the string when present and non-empty', () => {
    expect(reqStr({ x: 'hi' }, 'x')).toBe('hi');
  });

  it('returns null for absent, empty, or wrongly-typed inputs', () => {
    expect(reqStr({}, 'x')).toBeNull();
    expect(reqStr({ x: '' }, 'x')).toBeNull();
    expect(reqStr({ x: 42 }, 'x')).toBeNull();
    expect(reqStr({ x: null }, 'x')).toBeNull();
  });
});

describe('optStr / optNum / optBool', () => {
  it('returns the value when well-typed, undefined otherwise', () => {
    expect(optStr({ x: 'a' }, 'x')).toBe('a');
    expect(optStr({ x: 1 }, 'x')).toBeUndefined();
    expect(optStr({}, 'x')).toBeUndefined();

    expect(optNum({ x: 0 }, 'x')).toBe(0);
    expect(optNum({ x: '1' }, 'x')).toBeUndefined();

    expect(optBool({ x: false }, 'x')).toBe(false);
    expect(optBool({ x: 'true' }, 'x')).toBeUndefined();
  });
});

describe('nullStr (three-state)', () => {
  it('absent → undefined (no-op)', () => {
    expect(nullStr({}, 'x')).toBeUndefined();
  });
  it('explicit null → null (clear)', () => {
    expect(nullStr({ x: null }, 'x')).toBeNull();
  });
  it('string → string (set)', () => {
    expect(nullStr({ x: 'v' }, 'x')).toBe('v');
  });
  it('present but wrong type → undefined (skip)', () => {
    expect(nullStr({ x: 1 }, 'x')).toBeUndefined();
  });
});

describe('nullNum (three-state)', () => {
  it('absent → undefined, null → null, number → number, wrong → undefined', () => {
    expect(nullNum({}, 'x')).toBeUndefined();
    expect(nullNum({ x: null }, 'x')).toBeNull();
    expect(nullNum({ x: 0 }, 'x')).toBe(0);
    expect(nullNum({ x: 'no' }, 'x')).toBeUndefined();
  });
});

describe('copyOptStr', () => {
  it('writes the string to out when present', () => {
    const out: Record<string, unknown> = {};
    copyOptStr(out, { name: 'a' }, 'name');
    expect(out).toEqual({ name: 'a' });
  });

  it('does NOT write when absent', () => {
    const out: Record<string, unknown> = {};
    copyOptStr(out, {}, 'name');
    expect('name' in out).toBe(false);
  });

  it('drops null (non-nullable variant must not write null)', () => {
    const out: Record<string, unknown> = {};
    copyOptStr(out, { name: null }, 'name');
    expect('name' in out).toBe(false);
  });
});

describe('copyOptBool', () => {
  it('writes booleans (including false)', () => {
    const out: Record<string, unknown> = {};
    copyOptBool(out, { v: false }, 'v');
    expect(out).toEqual({ v: false });
  });

  it('skips non-booleans', () => {
    const out: Record<string, unknown> = {};
    copyOptBool(out, { v: 'true' }, 'v');
    expect('v' in out).toBe(false);
  });
});

describe('copyNullStr (three-state)', () => {
  it('passes string through', () => {
    const out: Record<string, unknown> = {};
    copyNullStr(out, { x: 'hi' }, 'x');
    expect(out).toEqual({ x: 'hi' });
  });

  it('passes explicit null through (so callers can clear nullable columns)', () => {
    const out: Record<string, unknown> = {};
    copyNullStr(out, { x: null }, 'x');
    expect(out).toEqual({ x: null });
  });

  it('skips when absent', () => {
    const out: Record<string, unknown> = {};
    copyNullStr(out, {}, 'x');
    expect('x' in out).toBe(false);
  });
});

describe('copyNullNum (three-state)', () => {
  it('passes 0 through (not omitted)', () => {
    const out: Record<string, unknown> = {};
    copyNullNum(out, { x: 0 }, 'x');
    expect(out).toEqual({ x: 0 });
  });

  it('passes explicit null through', () => {
    const out: Record<string, unknown> = {};
    copyNullNum(out, { x: null }, 'x');
    expect(out).toEqual({ x: null });
  });

  it('skips when absent or wrong type', () => {
    const out: Record<string, unknown> = {};
    copyNullNum(out, {}, 'x');
    copyNullNum(out, { x: 'no' }, 'x');
    expect('x' in out).toBe(false);
  });
});
