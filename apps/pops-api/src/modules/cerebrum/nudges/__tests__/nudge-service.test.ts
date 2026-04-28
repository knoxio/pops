import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NudgeCandidate, NudgeThresholds, NudgeType } from '../types.js';

// --- Mocks for modules that NudgeService imports ---

vi.mock('../../../../lib/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock the entire drizzle-orm to avoid column reference issues
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ _and: args })),
  count: vi.fn(() => ({ _count: true })),
  eq: vi.fn((col: unknown, val: unknown) => ({ _eq: [col, val] })),
  inArray: vi.fn((col: unknown, vals: unknown) => ({ _inArray: [col, vals] })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    _sql: strings.join('?'),
    _values: values,
  })),
}));

// Mock @pops/db-types — provide minimal column-like objects.
const mockNudgeLog = {
  id: { name: 'id' },
  type: { name: 'type' },
  title: { name: 'title' },
  body: { name: 'body' },
  engramIds: { name: 'engram_ids' },
  priority: { name: 'priority' },
  status: { name: 'status' },
  createdAt: { name: 'created_at' },
  expiresAt: { name: 'expires_at' },
  actedAt: { name: 'acted_at' },
  actionType: { name: 'action_type' },
  actionLabel: { name: 'action_label' },
  actionParams: { name: 'action_params' },
};

const mockEngramIndex = {
  id: { name: 'id' },
  type: { name: 'type' },
  title: { name: 'title' },
  status: { name: 'status' },
  createdAt: { name: 'created_at' },
  modifiedAt: { name: 'modified_at' },
};

const mockEngramScopes = {
  engramId: { name: 'engram_id' },
  scope: { name: 'scope' },
};

const mockEngramTags = {
  engramId: { name: 'engram_id' },
  tag: { name: 'tag' },
};

vi.mock('@pops/db-types', () => ({
  nudgeLog: mockNudgeLog,
  engramIndex: mockEngramIndex,
  engramScopes: mockEngramScopes,
  engramTags: mockEngramTags,
}));

const { NudgeService } = await import('../nudge-service.js');

function defaultThresholds(overrides: Partial<NudgeThresholds> = {}): NudgeThresholds {
  return {
    consolidationSimilarity: 0.85,
    consolidationMinCluster: 3,
    stalenessDays: 90,
    patternMinOccurrences: 5,
    maxPendingNudges: 20,
    nudgeCooldownHours: 24,
    ...overrides,
  };
}

function makeCandidate(overrides: Partial<NudgeCandidate> = {}): NudgeCandidate {
  return {
    type: overrides.type ?? 'staleness',
    title: overrides.title ?? 'Test nudge',
    body: overrides.body ?? 'Test body',
    engramIds: overrides.engramIds ?? ['eng_1'],
    priority: overrides.priority ?? 'medium',
    expiresAt: overrides.expiresAt ?? null,
    action: overrides.action ?? { type: 'review', label: 'Review', params: {} },
  };
}

const NOW = new Date('2026-04-27T10:00:00Z');
const fixedNow = () => NOW;

/** Create a chainable mock DB that returns specified rows for different calls. */
function createMockDb(allResults: unknown[][] = [[]]) {
  let callIndex = 0;
  let updateChanges = 0;

  const chain = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    all: vi.fn(() => {
      const result = allResults[callIndex] ?? [];
      callIndex++;
      return result;
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        run: vi.fn(() => ({ changes: 1 })),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          run: vi.fn(() => ({ changes: updateChanges })),
        }),
      }),
    }),
    $dynamic: vi.fn().mockReturnThis(),
    _setUpdateChanges(n: number) {
      updateChanges = n;
    },
  };

  return chain;
}

describe('NudgeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('scan', () => {
    it('orchestrates all detectors on a full scan', async () => {
      const mockConsolidation = { detect: vi.fn().mockResolvedValue({ nudges: [] }) };
      const mockStaleness = { detect: vi.fn().mockReturnValue({ nudges: [] }) };
      const mockPatterns = { detect: vi.fn().mockReturnValue({ nudges: [] }) };
      // call sequence: loadActiveEngrams x3 (engrams, scopes, tags), enforcePendingCap (count)
      const mockDb = createMockDb([[], [], [], [{ total: 0 }]]);

      const service = new NudgeService({
        db: mockDb as never,
        searchService: {} as never,
        consolidationDetector: mockConsolidation as never,
        stalenessDetector: mockStaleness as never,
        patternDetector: mockPatterns as never,
        thresholds: defaultThresholds(),
        now: fixedNow,
      });

      const result = await service.scan();

      expect(mockConsolidation.detect).toHaveBeenCalled();
      expect(mockStaleness.detect).toHaveBeenCalled();
      expect(mockPatterns.detect).toHaveBeenCalled();
      expect(result.created).toBe(0);
    });

    it('only runs specified detector type when filtered', async () => {
      const mockConsolidation = { detect: vi.fn().mockResolvedValue({ nudges: [] }) };
      const mockStaleness = {
        detect: vi.fn().mockReturnValue({
          nudges: [makeCandidate()],
        }),
      };
      const mockPatterns = { detect: vi.fn().mockReturnValue({ nudges: [] }) };
      // loadActiveEngrams (engrams, scopes, tags), isInCooldown, enforcePendingCap
      const mockDb = createMockDb([[], [], [], [], [{ total: 0 }]]);

      const service = new NudgeService({
        db: mockDb as never,
        searchService: {} as never,
        consolidationDetector: mockConsolidation as never,
        stalenessDetector: mockStaleness as never,
        patternDetector: mockPatterns as never,
        thresholds: defaultThresholds(),
        now: fixedNow,
      });

      await service.scan('staleness' as NudgeType);

      expect(mockConsolidation.detect).not.toHaveBeenCalled();
      expect(mockStaleness.detect).toHaveBeenCalled();
      expect(mockPatterns.detect).not.toHaveBeenCalled();
    });

    it('persists nudge candidates and returns created count', async () => {
      const candidates = [
        makeCandidate({ title: 'Nudge 1', engramIds: ['eng_1'] }),
        makeCandidate({ title: 'Nudge 2', engramIds: ['eng_2'] }),
      ];
      const mockStaleness = { detect: vi.fn().mockReturnValue({ nudges: candidates }) };
      // loadActiveEngrams (engrams, scopes, tags), isInCooldown x2, enforcePendingCap
      const mockDb = createMockDb([[], [], [], [], [], [{ total: 0 }]]);

      const service = new NudgeService({
        db: mockDb as never,
        searchService: {} as never,
        consolidationDetector: { detect: vi.fn().mockResolvedValue({ nudges: [] }) } as never,
        stalenessDetector: mockStaleness as never,
        patternDetector: { detect: vi.fn().mockReturnValue({ nudges: [] }) } as never,
        thresholds: defaultThresholds(),
        now: fixedNow,
      });

      const result = await service.scan('staleness' as NudgeType);

      expect(result.created).toBe(2);
      expect(mockDb.insert).toHaveBeenCalledTimes(2);
    });
  });

  describe('dismiss', () => {
    it('marks a pending nudge as dismissed', () => {
      const mockDb = createMockDb();
      mockDb._setUpdateChanges(1);

      const service = new NudgeService({
        db: mockDb as never,
        searchService: {} as never,
        consolidationDetector: {} as never,
        stalenessDetector: {} as never,
        patternDetector: {} as never,
        thresholds: defaultThresholds(),
        now: fixedNow,
      });

      const result = service.dismiss('nudge_123');
      expect(result.success).toBe(true);
    });

    it('returns false for non-pending nudge', () => {
      const mockDb = createMockDb();
      mockDb._setUpdateChanges(0);

      const service = new NudgeService({
        db: mockDb as never,
        searchService: {} as never,
        consolidationDetector: {} as never,
        stalenessDetector: {} as never,
        patternDetector: {} as never,
        thresholds: defaultThresholds(),
        now: fixedNow,
      });

      const result = service.dismiss('nudge_nonexistent');
      expect(result.success).toBe(false);
    });
  });

  describe('act', () => {
    it('marks a pending nudge as acted', () => {
      const nudgeRow = {
        id: 'nudge_123',
        type: 'staleness',
        title: 'Test',
        body: 'Body',
        engram_ids: '["eng_1"]',
        priority: 'medium',
        status: 'acted',
        created_at: '2026-04-27T10:00:00Z',
        expires_at: null,
        acted_at: '2026-04-27T10:00:00Z',
        action_type: 'review',
        action_label: 'Mark as reviewed',
        action_params: '{"engramId":"eng_1"}',
      };
      // get() after act: returns the nudge
      const mockDb = createMockDb([[nudgeRow]]);
      mockDb._setUpdateChanges(1);

      const service = new NudgeService({
        db: mockDb as never,
        searchService: {} as never,
        consolidationDetector: {} as never,
        stalenessDetector: {} as never,
        patternDetector: {} as never,
        thresholds: defaultThresholds(),
        now: fixedNow,
      });

      const result = service.act('nudge_123');
      expect(result.success).toBe(true);
      expect(result.nudge).not.toBeNull();
      expect(result.nudge?.status).toBe('acted');
    });

    it('returns false for non-pending nudge', () => {
      const mockDb = createMockDb();
      mockDb._setUpdateChanges(0);

      const service = new NudgeService({
        db: mockDb as never,
        searchService: {} as never,
        consolidationDetector: {} as never,
        stalenessDetector: {} as never,
        patternDetector: {} as never,
        thresholds: defaultThresholds(),
        now: fixedNow,
      });

      const result = service.act('nudge_nonexistent');
      expect(result.success).toBe(false);
      expect(result.nudge).toBeNull();
    });
  });

  describe('configure', () => {
    it('merges partial threshold updates', () => {
      const thresholds = defaultThresholds();
      const mockDb = createMockDb();

      const service = new NudgeService({
        db: mockDb as never,
        searchService: {} as never,
        consolidationDetector: {} as never,
        stalenessDetector: {} as never,
        patternDetector: {} as never,
        thresholds,
        now: fixedNow,
      });

      service.configure({ stalenessDays: 60, maxPendingNudges: 10 });
      expect(thresholds.stalenessDays).toBe(60);
      expect(thresholds.maxPendingNudges).toBe(10);
      // Unchanged.
      expect(thresholds.consolidationSimilarity).toBe(0.85);
    });
  });

  describe('list', () => {
    it('returns nudges and total count', () => {
      const nudgeRow = {
        id: 'nudge_test',
        type: 'staleness',
        title: 'Stale engram',
        body: 'Body text',
        engram_ids: '["eng_1"]',
        priority: 'medium',
        status: 'pending',
        created_at: '2026-04-27T10:00:00Z',
        expires_at: null,
        acted_at: null,
        action_type: 'review',
        action_label: 'Review',
        action_params: '{}',
      };
      const mockDb = createMockDb([[nudgeRow], [{ total: 1 }]]);

      const service = new NudgeService({
        db: mockDb as never,
        searchService: {} as never,
        consolidationDetector: {} as never,
        stalenessDetector: {} as never,
        patternDetector: {} as never,
        thresholds: defaultThresholds(),
        now: fixedNow,
      });

      const result = service.list();
      expect(result.nudges).toHaveLength(1);
      expect(result.nudges[0]?.id).toBe('nudge_test');
      expect(result.total).toBe(1);
    });
  });

  describe('get', () => {
    it('returns null for non-existent nudge', () => {
      const mockDb = createMockDb([[]]);

      const service = new NudgeService({
        db: mockDb as never,
        searchService: {} as never,
        consolidationDetector: {} as never,
        stalenessDetector: {} as never,
        patternDetector: {} as never,
        thresholds: defaultThresholds(),
        now: fixedNow,
      });

      const result = service.get('nudge_nonexistent');
      expect(result).toBeNull();
    });
  });
});
