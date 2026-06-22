import { describe, expect, it } from 'vitest';

import { ensure, getBulk, getOrNull, listEffective, setBulk, setRaw } from '../service.js';
import { makeRejectingDb, makeTestDb, POISON_VALUE } from './helpers.js';

import type { KeyDefaults } from '../manifest-keys.js';

const kd: KeyDefaults = {
  keys: ['a', 'b', 'c'],
  defaults: { a: 'da', b: 'db' },
  sensitive: [],
};

describe('getOrNull / setRaw', () => {
  it('returns null for an unset key', () => {
    const db = makeTestDb();
    expect(getOrNull(db, 'a')).toBeNull();
  });

  it('round-trips an upsert and overwrites on a second write', () => {
    const db = makeTestDb();
    expect(setRaw(db, 'a', 'one')).toEqual({ key: 'a', value: 'one' });
    expect(getOrNull(db, 'a')).toEqual({ key: 'a', value: 'one' });
    setRaw(db, 'a', 'two');
    expect(getOrNull(db, 'a')).toEqual({ key: 'a', value: 'two' });
  });
});

describe('getBulk', () => {
  it('omits missing keys and de-dupes input', () => {
    const db = makeTestDb();
    setRaw(db, 'a', '1');
    setRaw(db, 'b', '2');
    expect(getBulk(db, ['a', 'a', 'b', 'missing'])).toEqual({ a: '1', b: '2' });
  });

  it('returns an empty object for no keys', () => {
    expect(getBulk(makeTestDb(), [])).toEqual({});
  });
});

describe('listEffective', () => {
  it('resolves override → default → empty string per declared key', () => {
    const db = makeTestDb();
    setRaw(db, 'a', 'override-a');
    expect(listEffective(db, kd)).toEqual([
      { key: 'a', value: 'override-a' },
      { key: 'b', value: 'db' },
      { key: 'c', value: '' },
    ]);
  });
});

describe('setBulk', () => {
  it('writes every entry and mirrors them back', () => {
    const db = makeTestDb();
    expect(
      setBulk(db, [
        { key: 'a', value: '1' },
        { key: 'b', value: '2' },
      ])
    ).toEqual({
      a: '1',
      b: '2',
    });
    expect(getBulk(db, ['a', 'b'])).toEqual({ a: '1', b: '2' });
  });

  it('is transactional: a mid-batch failure rolls the whole batch back', () => {
    const db = makeRejectingDb();
    setRaw(db, 'a', 'original');
    const badEntries = [
      { key: 'a', value: 'changed' },
      { key: 'b', value: POISON_VALUE },
    ];
    expect(() => setBulk(db, badEntries)).toThrow();
    expect(getOrNull(db, 'a')).toEqual({ key: 'a', value: 'original' });
    expect(getOrNull(db, 'b')).toBeNull();
  });

  it('returns an empty object for no entries', () => {
    expect(setBulk(makeTestDb(), [])).toEqual({});
  });
});

describe('ensure (write-once seed)', () => {
  it('persists on first call and never clobbers on later calls', () => {
    const db = makeTestDb();
    expect(ensure(db, 'seed', 'first')).toEqual({ key: 'seed', value: 'first' });
    expect(ensure(db, 'seed', 'second')).toEqual({ key: 'seed', value: 'first' });
    expect(getOrNull(db, 'seed')).toEqual({ key: 'seed', value: 'first' });
  });
});
