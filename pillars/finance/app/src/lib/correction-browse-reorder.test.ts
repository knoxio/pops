import { describe, expect, it } from 'vitest';

import {
  applyBrowsePriorityReorder,
  compareRulesForBrowse,
  effectiveRulePriority,
  sortRulesForBrowseDisplay,
} from './correction-browse-reorder';

import type { LocalOp } from '../components/imports/correction-proposal-shared';
import type { CorrectionRule } from '../components/imports/RulePicker';

function rule(
  partial: Partial<CorrectionRule> & Pick<CorrectionRule, 'id' | 'descriptionPattern'>
): CorrectionRule {
  return {
    matchType: 'exact',
    entityId: null,
    entityName: null,
    location: null,
    tags: [],
    transactionType: null,
    isActive: true,
    priority: 0,
    confidence: 0.9,
    timesApplied: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastUsedAt: null,
    ...partial,
  };
}

describe('correction-browse-reorder', () => {
  it('sorts by priority then id', () => {
    const rules = [
      rule({ id: 'b', descriptionPattern: 'B', priority: 20 }),
      rule({ id: 'a', descriptionPattern: 'A', priority: 10 }),
    ];
    const sorted = sortRulesForBrowseDisplay(rules, []);
    expect(sorted.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('respects priority from local edit ops', () => {
    const rules = [
      rule({ id: 'a', descriptionPattern: 'A', priority: 10 }),
      rule({ id: 'b', descriptionPattern: 'B', priority: 20 }),
    ];
    const localOps: LocalOp[] = [
      {
        kind: 'edit',
        clientId: 'e1',
        targetRuleId: 'b',
        targetRule: rules[1] ?? null,
        data: { priority: 5 },
        dirty: true,
      },
    ];
    const sorted = sortRulesForBrowseDisplay(rules, localOps);
    expect(sorted.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('applyBrowsePriorityReorder assigns gaps of 10', () => {
    const r0 = rule({ id: 'x', descriptionPattern: 'X', priority: 10 });
    const r1 = rule({ id: 'y', descriptionPattern: 'Y', priority: 20 });
    const reordered = [r1, r0];
    const next = applyBrowsePriorityReorder(reordered, []);
    expect(next).toHaveLength(2);
    expect(next[0]?.kind).toBe('edit');
    expect(next[1]?.kind).toBe('edit');
    if (next[0]?.kind === 'edit' && next[1]?.kind === 'edit') {
      const byId = Object.fromEntries(
        next.map((o) => (o.kind === 'edit' ? [o.targetRuleId, o.data.priority] : []))
      );
      expect(byId['y']).toBe(10);
      expect(byId['x']).toBe(20);
    }
  });

  it('compareRulesForBrowse tie-breaks by id', () => {
    const a = rule({ id: 'a', descriptionPattern: 'A', priority: 0 });
    const b = rule({ id: 'b', descriptionPattern: 'B', priority: 0 });
    expect(compareRulesForBrowse(a, b)).toBeLessThan(0);
  });

  it('effectiveRulePriority reads last matching edit', () => {
    const r = rule({ id: 'a', descriptionPattern: 'A', priority: 100 });
    const ops: LocalOp[] = [
      {
        kind: 'edit',
        clientId: '1',
        targetRuleId: 'a',
        targetRule: r,
        data: { priority: 50 },
        dirty: true,
      },
      {
        kind: 'edit',
        clientId: '2',
        targetRuleId: 'a',
        targetRule: r,
        data: { priority: 30 },
        dirty: true,
      },
    ];
    expect(effectiveRulePriority(r, ops)).toBe(30);
  });
});
