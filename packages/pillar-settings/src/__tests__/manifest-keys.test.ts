import { describe, expect, it } from 'vitest';

import { deriveKeySet, keyValuesFor, type DeclaredSettingsManifest } from '../manifest-keys.js';

const manifests: DeclaredSettingsManifest[] = [
  {
    groups: [
      {
        fields: [
          { key: 'finance.aiCategorizer.model', default: 'gpt-4o-mini' },
          { key: 'finance.apiToken', sensitive: true },
        ],
      },
      {
        fields: [{ key: 'finance.retentionDays', default: '90' }],
      },
    ],
  },
  {
    groups: [{ fields: [{ key: 'finance.enabled', default: 'true', sensitive: false }] }],
  },
];

describe('deriveKeySet', () => {
  it('collects every declared key in declaration order', () => {
    const kd = deriveKeySet(manifests);
    expect(kd.keys).toEqual([
      'finance.aiCategorizer.model',
      'finance.apiToken',
      'finance.retentionDays',
      'finance.enabled',
    ]);
  });

  it('maps only keys that declare an explicit default', () => {
    const kd = deriveKeySet(manifests);
    expect(kd.defaults).toEqual({
      'finance.aiCategorizer.model': 'gpt-4o-mini',
      'finance.retentionDays': '90',
      'finance.enabled': 'true',
    });
    expect(kd.defaults['finance.apiToken']).toBeUndefined();
  });

  it('collects only fields flagged sensitive === true', () => {
    const kd = deriveKeySet(manifests);
    expect(kd.sensitive).toEqual(['finance.apiToken']);
  });

  it('returns empty sets for an empty manifest list', () => {
    const kd = deriveKeySet([]);
    expect(kd.keys).toEqual([]);
    expect(kd.defaults).toEqual({});
    expect(kd.sensitive).toEqual([]);
  });

  it('handles manifests with empty groups', () => {
    const kd = deriveKeySet([{ groups: [] }]);
    expect(kd.keys).toEqual([]);
  });
});

describe('keyValuesFor', () => {
  it('returns the declared keys as a non-empty tuple preserving order', () => {
    const kd = deriveKeySet(manifests);
    expect(keyValuesFor(kd)).toEqual([
      'finance.aiCategorizer.model',
      'finance.apiToken',
      'finance.retentionDays',
      'finance.enabled',
    ]);
  });

  it('throws when the pillar declares no settings keys', () => {
    const kd = deriveKeySet([]);
    expect(() => keyValuesFor(kd)).toThrow(/at least one settings key/);
  });
});
