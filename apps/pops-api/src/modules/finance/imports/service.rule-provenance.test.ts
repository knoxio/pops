import { beforeEach, describe, expect, it, vi } from 'vitest';

import { applyLearnedCorrection } from './service.js';

vi.mock('../../core/corrections/service.js', () => {
  return {
    findAllMatchingCorrectionFromDB: vi.fn(),
  };
});

vi.mock('../../../shared/tag-suggester.js', () => {
  return {
    suggestTags: () => [],
  };
});

import { findAllMatchingCorrectionFromDB } from '../../core/corrections/service.js';

const correctionRow = {
  id: 'corr_123',
  descriptionPattern: 'WOOLWORTHS',
  matchType: 'contains' as const,
  entityId: 'ent_1',
  entityName: 'Woolworths',
  location: null,
  tags: '[]',
  transactionType: null,
  isActive: true,
  confidence: 0.92,
  priority: 0,
  timesApplied: 10,
  createdAt: '2026-01-01T00:00:00.000Z',
  lastUsedAt: null,
};

describe('applyLearnedCorrection ruleProvenance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('populates ruleProvenance fields from matched correction', () => {
    vi.mocked(findAllMatchingCorrectionFromDB).mockReturnValue([correctionRow]);

    const res = applyLearnedCorrection({
      transaction: {
        date: '2026-04-01',
        description: 'WOOLWORTHS 1234',
        amount: -12.34,
        account: 'Everyday',
        rawRow: '{}',
        checksum: 'abc',
      },
      minConfidence: 0.7,
      knownTags: [],
      index: 1,
      total: 1,
    });

    expect(res).not.toBeNull();
    expect(res?.processed.ruleProvenance).toEqual({
      source: 'correction',
      ruleId: 'corr_123',
      pattern: 'WOOLWORTHS',
      matchType: 'contains',
      confidence: 0.92,
    });
  });

  it('populates matchedRules from all matching corrections', () => {
    const secondRow = {
      ...correctionRow,
      id: 'corr_456',
      descriptionPattern: 'WOOL',
      matchType: 'contains' as const,
      entityName: 'Wool Store',
      priority: 10,
    };
    vi.mocked(findAllMatchingCorrectionFromDB).mockReturnValue([correctionRow, secondRow]);

    const res = applyLearnedCorrection({
      transaction: {
        date: '2026-04-01',
        description: 'WOOLWORTHS 1234',
        amount: -12.34,
        account: 'Everyday',
        rawRow: '{}',
        checksum: 'abc',
      },
      minConfidence: 0.7,
      knownTags: [],
      index: 1,
      total: 1,
    });

    expect(res).not.toBeNull();
    expect(res?.processed.matchedRules).toHaveLength(2);
    expect(res?.processed.matchedRules?.[0]?.ruleId).toBe('corr_123');
    expect(res?.processed.matchedRules?.[1]?.ruleId).toBe('corr_456');
  });

  it('returns null when no correction matches', () => {
    vi.mocked(findAllMatchingCorrectionFromDB).mockReturnValue([]);

    const res = applyLearnedCorrection({
      transaction: {
        date: '2026-04-01',
        description: 'SOME MERCHANT',
        amount: -10,
        account: 'Everyday',
        rawRow: '{}',
        checksum: 'abc',
      },
      minConfidence: 0.7,
      knownTags: [],
      index: 1,
      total: 1,
    });

    expect(res).toBeNull();
  });
});
