import { describe, expect, it } from 'vitest';

import { syncOutcomeLine, syncRefusal } from './ImportActions';
import { bodyOf, missingRequiredField, valuesOf } from './SourceFormDialog';
import { cadenceLabel, formatOf } from './SourceSection';

import type { ImportConfigWire } from './types';

function config(overrides: Partial<ImportConfigWire> = {}): ImportConfigWire {
  return {
    accountId: 'acc-1',
    sourceKind: 'csv-dialect',
    dialectId: 'Amex',
    parserId: null,
    provider: null,
    externalAccountRef: null,
    expectedCadenceDays: null,
    secretRef: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('formatOf', () => {
  it('names what its kind actually reads, and says so when the field is missing', () => {
    expect(formatOf(config())).toBe('Amex');
    expect(formatOf(config({ sourceKind: 'pdf-statement', parserId: 'anz-pdf-statement' }))).toBe(
      'anz-pdf-statement'
    );
    expect(formatOf(config({ sourceKind: 'api', provider: 'up' }))).toBe('Up live feed');
    expect(formatOf(config({ dialectId: null }))).toBe('Not set');
  });
});

describe('cadenceLabel', () => {
  it('names the common cadences and counts the rest', () => {
    expect(cadenceLabel(null)).toBe('Not set');
    expect(cadenceLabel(1)).toBe('Daily');
    expect(cadenceLabel(7)).toBe('Weekly');
    expect(cadenceLabel(30)).toBe('Monthly');
    expect(cadenceLabel(14)).toBe('Every 14 days');
  });
});

describe('syncRefusal', () => {
  it('refuses an account nothing feeds, one fed by a file, and one with no secret', () => {
    expect(syncRefusal(null)).toMatch(/provider API/);
    expect(syncRefusal(config())).toMatch(/provider API/);
    expect(syncRefusal(config({ sourceKind: 'api', provider: 'up' }))).toMatch(/names no secret/);
  });

  it('offers the sync for a configured Up account', () => {
    expect(
      syncRefusal(config({ sourceKind: 'api', provider: 'up', secretRef: 'UP_API_TOKEN' }))
    ).toBeNull();
  });
});

describe('syncOutcomeLine', () => {
  it('reports what the pass did in the words of staging, not importing', () => {
    expect(syncOutcomeLine(0, 0)).toBe('Up had nothing new.');
    expect(syncOutcomeLine(3, 0)).toBe('3 staged for review.');
    expect(syncOutcomeLine(0, 2)).toBe('2 settled.');
    expect(syncOutcomeLine(3, 1)).toBe('3 staged for review, 1 settled.');
  });
});

describe('the source form', () => {
  it('starts from the config, or from a CSV account when there is none', () => {
    expect(valuesOf(null)).toMatchObject({
      sourceKind: 'csv-dialect',
      dialectId: '',
      provider: 'up',
    });
    expect(
      valuesOf(config({ sourceKind: 'api', provider: 'up', secretRef: 'UP_API_TOKEN' }))
    ).toMatchObject({
      sourceKind: 'api',
      secretRef: 'UP_API_TOKEN',
    });
  });

  it('names the field each kind needs before the server refuses it', () => {
    expect(missingRequiredField(valuesOf(null))).toBe('a dialect');
    expect(missingRequiredField({ ...valuesOf(null), dialectId: 'ANZ' })).toBeNull();
    expect(missingRequiredField({ ...valuesOf(null), sourceKind: 'pdf-statement' })).toBe(
      'a parser'
    );
    expect(
      missingRequiredField({
        ...valuesOf(null),
        sourceKind: 'pdf-statement',
        parserId: 'anz-pdf-statement',
      })
    ).toBeNull();
    expect(missingRequiredField({ ...valuesOf(null), sourceKind: 'api', provider: '' })).toBe(
      'a provider'
    );
  });

  it('sends only the fields the chosen kind uses, with empty text as absence', () => {
    expect(
      bodyOf({
        ...valuesOf(null),
        dialectId: 'ANZ',
        secretRef: 'LEFTOVER',
        expectedCadenceDays: '',
      })
    ).toEqual({
      sourceKind: 'csv-dialect',
      dialectId: 'ANZ',
      parserId: null,
      provider: null,
      externalAccountRef: null,
      expectedCadenceDays: null,
      secretRef: null,
    });
    expect(
      bodyOf({
        ...valuesOf(null),
        sourceKind: 'api',
        provider: 'up',
        externalAccountRef: 'up-acc-1',
        secretRef: 'UP_API_TOKEN',
        dialectId: 'LEFTOVER',
        expectedCadenceDays: '7',
      })
    ).toEqual({
      sourceKind: 'api',
      dialectId: null,
      parserId: null,
      provider: 'up',
      externalAccountRef: 'up-acc-1',
      expectedCadenceDays: 7,
      secretRef: 'UP_API_TOKEN',
    });
    expect(
      bodyOf({ ...valuesOf(null), dialectId: 'ANZ', expectedCadenceDays: 'soon' })
        .expectedCadenceDays
    ).toBeNull();
    expect(
      bodyOf({ ...valuesOf(null), dialectId: 'ANZ', expectedCadenceDays: '0' }).expectedCadenceDays
    ).toBeNull();
  });
});
