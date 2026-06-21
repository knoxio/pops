import { describe, expect, it } from 'vitest';

import { getOrNull, listEffective, resetSetting, resetSettings, setRaw } from '../service.js';
import { makeTestDb } from './helpers.js';

import type { KeyDefaults } from '../manifest-keys.js';

const kd: KeyDefaults = {
  keys: ['a', 'b', 'c'],
  defaults: { a: 'da', b: 'db' },
  sensitive: [],
};

describe('resetSetting', () => {
  it('deletes the override and returns the manifest default', () => {
    const db = makeTestDb();
    setRaw(db, 'a', 'override');
    expect(resetSetting(db, 'a', kd)).toEqual({ key: 'a', value: 'da' });
    expect(getOrNull(db, 'a')).toBeNull();
  });

  it('is idempotent: resetting an unset key does not throw', () => {
    const db = makeTestDb();
    expect(() => resetSetting(db, 'a', kd)).not.toThrow();
    expect(resetSetting(db, 'a', kd)).toEqual({ key: 'a', value: 'da' });
  });

  it('returns the empty string for a key with no declared default', () => {
    const db = makeTestDb();
    setRaw(db, 'c', 'override');
    expect(resetSetting(db, 'c', kd)).toEqual({ key: 'c', value: '' });
  });
});

describe('resetSettings', () => {
  it('resets only the supplied declared keys', () => {
    const db = makeTestDb();
    setRaw(db, 'a', 'oa');
    setRaw(db, 'b', 'ob');
    const result = resetSettings(db, ['a'], kd);
    expect(result).toEqual({ reset: ['a'], settings: { a: 'da' } });
    expect(getOrNull(db, 'a')).toBeNull();
    expect(getOrNull(db, 'b')).toEqual({ key: 'b', value: 'ob' });
  });

  it('resets ALL declared keys when keys is omitted', () => {
    const db = makeTestDb();
    setRaw(db, 'a', 'oa');
    setRaw(db, 'b', 'ob');
    const result = resetSettings(db, undefined, kd);
    expect(result.reset).toEqual(['a', 'b', 'c']);
    expect(result.settings).toEqual({ a: 'da', b: 'db', c: '' });
    expect(listEffective(db, kd)).toEqual([
      { key: 'a', value: 'da' },
      { key: 'b', value: 'db' },
      { key: 'c', value: '' },
    ]);
  });

  it('resets ALL declared keys when keys is an empty array', () => {
    const db = makeTestDb();
    expect(resetSettings(db, [], kd).reset).toEqual(['a', 'b', 'c']);
  });

  it('silently ignores unknown keys, never writing them', () => {
    const db = makeTestDb();
    setRaw(db, 'a', 'oa');
    const result = resetSettings(db, ['a', 'not-declared'], kd);
    expect(result.reset).toEqual(['a']);
    expect(result.settings).toEqual({ a: 'da' });
    expect(getOrNull(db, 'not-declared')).toBeNull();
  });
});
