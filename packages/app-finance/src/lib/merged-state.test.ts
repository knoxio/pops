import type { Correction } from '@pops/api/modules/core/corrections/types';
import type { Entity } from '@pops/api/modules/core/entities/types';
import { describe, expect, it } from 'vitest';

import type { ChangeSet, PendingChangeSet, PendingEntity } from '../store/importStore';
import { computeMergedEntities, computeMergedRules } from './merged-state';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRule(overrides: Partial<Correction> = {}): Correction {
  return {
    id: 'rule-1',
    descriptionPattern: 'WOOLWORTHS',
    matchType: 'exact',
    entityId: 'entity-1',
    entityName: 'Woolworths',
    location: null,
    tags: [],
    transactionType: 'purchase',
    isActive: true,
    confidence: 0.95,
    timesApplied: 10,
    priority: 0,
    createdAt: '2026-01-01T00:00:00Z',
    lastUsedAt: '2026-03-01T00:00:00Z',
    ...overrides,
  };
}

function makePendingChangeSet(
  changeSet: ChangeSet,
  overrides: Partial<PendingChangeSet> = {}
): PendingChangeSet {
  return {
    tempId: `temp:changeset:${crypto.randomUUID()}`,
    changeSet,
    appliedAt: '2026-04-12T00:00:00Z',
    source: 'test',
    ...overrides,
  };
}

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'entity-1',
    name: 'Woolworths',
    type: 'company',
    abn: null,
    aliases: [],
    defaultTransactionType: null,
    defaultTags: [],
    notes: null,
    lastEditedTime: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makePendingEntity(overrides: Partial<PendingEntity> = {}): PendingEntity {
  return {
    tempId: `temp:entity:${crypto.randomUUID()}`,
    name: 'New Merchant',
    type: 'company',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// computeMergedRules — PRD-030 US-03
// ---------------------------------------------------------------------------

describe('computeMergedRules', () => {
  it('returns dbRules unchanged (referential equality) when no pending ChangeSets', () => {
    const dbRules = [makeRule()];
    const result = computeMergedRules(dbRules, []);
    expect(result).toBe(dbRules);
  });

  it('applies a single add operation', () => {
    const dbRules = [makeRule()];
    const cs = makePendingChangeSet({
      ops: [
        {
          op: 'add',
          data: {
            descriptionPattern: 'coles',
            matchType: 'exact',
            entityId: 'entity-2',
            entityName: 'Coles',
            confidence: 0.9,
          },
        },
      ],
    });

    const result = computeMergedRules(dbRules, [cs]);
    expect(result).toHaveLength(2);
    expect(result[1].descriptionPattern).toBe('COLES');
    expect(result[1].id).toMatch(/^temp:/);
  });

  it('applies a single edit operation', () => {
    const dbRules = [makeRule({ id: 'rule-1', confidence: 0.5 })];
    const cs = makePendingChangeSet({
      ops: [{ op: 'edit', id: 'rule-1', data: { confidence: 0.99 } }],
    });

    const result = computeMergedRules(dbRules, [cs]);
    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe(0.99);
  });

  it('applies multiple sequential ChangeSets (add then edit same rule)', () => {
    const dbRules: Correction[] = [];

    const cs1 = makePendingChangeSet({
      ops: [
        {
          op: 'add',
          data: {
            descriptionPattern: 'aldi',
            matchType: 'exact',
            entityId: 'entity-3',
            entityName: 'Aldi',
            confidence: 0.8,
          },
        },
      ],
    });

    // After cs1, the added rule gets a temp ID like "temp:1"
    const intermediateResult = computeMergedRules(dbRules, [cs1]);
    const addedRuleId = intermediateResult[0].id;

    const cs2 = makePendingChangeSet({
      ops: [{ op: 'edit', id: addedRuleId, data: { confidence: 0.95 } }],
    });

    const result = computeMergedRules(dbRules, [cs1, cs2]);
    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe(0.95);
  });

  it('throws when a ChangeSet references a removed rule', () => {
    const dbRules = [makeRule({ id: 'rule-1' })];

    const cs1 = makePendingChangeSet({
      ops: [{ op: 'remove', id: 'rule-1' }],
    });

    const cs2 = makePendingChangeSet({
      ops: [{ op: 'edit', id: 'rule-1', data: { confidence: 0.5 } }],
    });

    expect(() => computeMergedRules(dbRules, [cs1, cs2])).toThrow();
  });

  it('handles mixed operations across ChangeSets', () => {
    const dbRules = [
      makeRule({ id: 'rule-1', descriptionPattern: 'WOOLWORTHS' }),
      makeRule({ id: 'rule-2', descriptionPattern: 'COLES' }),
    ];

    const cs = makePendingChangeSet({
      ops: [
        {
          op: 'add',
          data: {
            descriptionPattern: 'aldi',
            matchType: 'exact',
            entityId: 'entity-3',
            entityName: 'Aldi',
            confidence: 0.8,
          },
        },
        { op: 'disable', id: 'rule-2' },
        { op: 'edit', id: 'rule-1', data: { confidence: 0.99 } },
      ],
    });

    const result = computeMergedRules(dbRules, [cs]);
    expect(result).toHaveLength(3);

    const rule1 = result.find((r) => r.id === 'rule-1');
    expect(rule1?.confidence).toBe(0.99);

    const rule2 = result.find((r) => r.id === 'rule-2');
    expect(rule2?.isActive).toBe(false);

    const addedRule = result.find((r) => r.id.startsWith('temp:'));
    expect(addedRule?.descriptionPattern).toBe('ALDI');
  });

  it('is memoized — same input refs return same output ref', () => {
    const dbRules = [makeRule()];
    const pending = [
      makePendingChangeSet({
        ops: [{ op: 'edit', id: 'rule-1', data: { confidence: 0.8 } }],
      }),
    ];

    const result1 = computeMergedRules(dbRules, pending);
    const result2 = computeMergedRules(dbRules, pending);
    expect(result1).toBe(result2);
  });

  it('recomputes when input refs change', () => {
    const dbRules = [makeRule()];
    const pending1 = [
      makePendingChangeSet({
        ops: [{ op: 'edit', id: 'rule-1', data: { confidence: 0.8 } }],
      }),
    ];
    const pending2 = [
      makePendingChangeSet({
        ops: [{ op: 'edit', id: 'rule-1', data: { confidence: 0.9 } }],
      }),
    ];

    const result1 = computeMergedRules(dbRules, pending1);
    const result2 = computeMergedRules(dbRules, pending2);
    expect(result1).not.toBe(result2);
    expect(result1[0].confidence).toBe(0.8);
    expect(result2[0].confidence).toBe(0.9);
  });

  it('preserves tags as string[] (not a JSON-encoded string) after applying ops', () => {
    // Regression guard: the previous implementation leaked CorrectionRow (tags: string)
    // out of the merge, which caused downstream edit ops to send `tags: "[\"grocery\"]"`
    // and fail server-side Zod validation.
    const dbRules = [makeRule({ id: 'r1', tags: ['grocery'] })];
    const cs = makePendingChangeSet({
      ops: [{ op: 'edit', id: 'r1', data: { confidence: 0.9 } }],
    });
    const [merged] = computeMergedRules(dbRules, [cs]);
    expect(Array.isArray(merged?.tags)).toBe(true);
    expect(merged?.tags).toEqual(['grocery']);
  });
});

// ---------------------------------------------------------------------------
// computeMergedEntities — PRD-030 US-04
// ---------------------------------------------------------------------------

describe('computeMergedEntities', () => {
  it('returns dbEntities unchanged when no pending entities', () => {
    const dbEntities = [makeEntity()];
    const result = computeMergedEntities(dbEntities, []);
    expect(result).toBe(dbEntities);
  });

  it('adds pending entities after DB entities when no collision', () => {
    const dbEntities = [makeEntity({ id: 'e1', name: 'Woolworths' })];
    const pending = [makePendingEntity({ name: 'Coles' })];

    const result = computeMergedEntities(dbEntities, pending);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Woolworths');
    expect(result[1].name).toBe('Coles');
    expect(result[1].id).toMatch(/^temp:entity:/);
  });

  it('replaces DB entity when pending entity has same name', () => {
    const dbEntities = [makeEntity({ id: 'e1', name: 'Woolworths', type: 'company' })];
    const pending = [makePendingEntity({ name: 'Woolworths', type: 'supermarket' })];

    const result = computeMergedEntities(dbEntities, pending);
    expect(result).toHaveLength(1);
    expect(result[0].id).toMatch(/^temp:entity:/);
    expect(result[0].type).toBe('supermarket');
  });

  it('handles multiple collisions', () => {
    const dbEntities = [
      makeEntity({ id: 'e1', name: 'Woolworths' }),
      makeEntity({ id: 'e2', name: 'Coles' }),
      makeEntity({ id: 'e3', name: 'Aldi' }),
    ];
    const pending = [
      makePendingEntity({ name: 'Woolworths', type: 'updated' }),
      makePendingEntity({ name: 'Coles', type: 'updated' }),
    ];

    const result = computeMergedEntities(dbEntities, pending);
    expect(result).toHaveLength(3);
    // Aldi (non-colliding DB) comes first
    expect(result[0].name).toBe('Aldi');
    expect(result[0].id).toBe('e3');
    // Then pending entities
    expect(result[1].type).toBe('updated');
    expect(result[2].type).toBe('updated');
  });

  it('handles case-insensitive collision', () => {
    const dbEntities = [makeEntity({ id: 'e1', name: 'Woolworths' })];
    const pending = [makePendingEntity({ name: 'woolworths', type: 'updated' })];

    const result = computeMergedEntities(dbEntities, pending);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('woolworths');
    expect(result[0].id).toMatch(/^temp:entity:/);
  });

  it('handles empty DB list with pending entities', () => {
    const pending = [
      makePendingEntity({ name: 'New Corp' }),
      makePendingEntity({ name: 'Another Corp' }),
    ];

    const result = computeMergedEntities([], pending);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('New Corp');
    expect(result[1].name).toBe('Another Corp');
    expect(result[0].aliases).toEqual([]);
    expect(result[0].abn).toBeNull();
    expect(result[0].defaultTransactionType).toBeNull();
    expect(result[0].defaultTags).toEqual([]);
    expect(result[0].notes).toBeNull();
  });

  it('is memoized — same input refs return same output ref', () => {
    const dbEntities = [makeEntity()];
    const pending = [makePendingEntity()];

    const result1 = computeMergedEntities(dbEntities, pending);
    const result2 = computeMergedEntities(dbEntities, pending);
    expect(result1).toBe(result2);
  });

  it('recomputes when input refs change', () => {
    const dbEntities = [makeEntity()];
    const pending1 = [makePendingEntity({ name: 'A' })];
    const pending2 = [makePendingEntity({ name: 'B' })];

    const result1 = computeMergedEntities(dbEntities, pending1);
    const result2 = computeMergedEntities(dbEntities, pending2);
    expect(result1).not.toBe(result2);
  });
});
