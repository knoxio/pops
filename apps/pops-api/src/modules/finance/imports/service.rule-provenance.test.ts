import { beforeEach, describe, expect, it, vi } from 'vitest';

import { applyLearnedCorrection } from './service.js';

vi.mock('../../core/corrections/service.js', () => {
  return {
    findMatchingCorrection: vi.fn(),
  };
});

vi.mock('../../../shared/tag-suggester.js', () => {
  return {
    suggestTags: () => [],
  };
});

import { findMatchingCorrection } from '../../core/corrections/service.js';

describe('applyLearnedCorrection ruleProvenance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('populates ruleProvenance fields from matched correction', () => {
    vi.mocked(findMatchingCorrection).mockReturnValue({
      status: 'matched',
      correction: {
        id: 'corr_123',
        descriptionPattern: 'WOOLWORTHS',
        matchType: 'contains',
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
      },
    });

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

  it('returns null when no correction matches', () => {
    vi.mocked(findMatchingCorrection).mockReturnValue(null);

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
