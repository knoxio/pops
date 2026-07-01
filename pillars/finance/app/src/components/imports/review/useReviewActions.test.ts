import { describe, expect, it } from 'vitest';

import { moveOneToMatched, type LocalTxState } from './useReviewActions';

import type { ProcessedTransaction } from '../../../store/importStore';

function makeProcessed(
  checksum: string,
  overrides: Partial<ProcessedTransaction> = {}
): ProcessedTransaction {
  return {
    date: '2026-02-06',
    description: `TXN ${checksum}`,
    amount: -44.63,
    account: 'Amex',
    rawRow: `{"checksum":"${checksum}"}`,
    checksum,
    entity: { matchType: 'none' },
    status: 'uncertain',
    ...overrides,
  };
}

function emptyState(overrides: Partial<LocalTxState> = {}): LocalTxState {
  return { matched: [], uncertain: [], failed: [], skipped: [], ...overrides };
}

describe('moveOneToMatched', () => {
  it('replaces an already-matched transaction in place instead of appending a duplicate', () => {
    const target = makeProcessed('bunnings', {
      description: 'BUNNINGS WAREHOUSE KING KINGSGROVE',
      status: 'matched',
      entity: { matchType: 'learned' },
    });
    const other = makeProcessed('maccas', { status: 'matched', entity: { matchType: 'ai' } });
    const prev = emptyState({ matched: [other, target] });

    const next = moveOneToMatched(prev, {
      transaction: target,
      entityId: 'ent-bunnings',
      entityName: 'Bunnings Warehouse',
      matchType: 'manual',
    });

    // No duplicate: the matched bucket keeps the same length.
    expect(next.matched).toHaveLength(2);
    // Only one card carries the target checksum after the update.
    expect(next.matched.filter((t) => t.checksum === 'bunnings')).toHaveLength(1);
    // Position is preserved (target stays at index 1, behind `other`).
    expect(next.matched[1]?.checksum).toBe('bunnings');
    // The picked entity actually lands on the transaction.
    expect(next.matched[1]?.entity).toEqual({
      entityId: 'ent-bunnings',
      entityName: 'Bunnings Warehouse',
      matchType: 'manual',
      confidence: 1,
    });
    // Untouched sibling is left exactly as-is.
    expect(next.matched[0]).toBe(other);
  });

  it('appends when the transaction is not already matched, removing it from uncertain', () => {
    const target = makeProcessed('unknown-1', { status: 'uncertain' });
    const prev = emptyState({ uncertain: [target] });

    const next = moveOneToMatched(prev, {
      transaction: target,
      entityId: 'ent-x',
      entityName: 'X Corp',
      matchType: 'manual',
    });

    expect(next.uncertain).toHaveLength(0);
    expect(next.matched).toHaveLength(1);
    expect(next.matched[0]?.checksum).toBe('unknown-1');
    expect(next.matched[0]?.status).toBe('matched');
  });

  it('removes the transaction from the failed bucket when promoting it', () => {
    const target = makeProcessed('failed-1', { status: 'failed' });
    const prev = emptyState({ failed: [target] });

    const next = moveOneToMatched(prev, {
      transaction: target,
      entityId: 'ent-y',
      entityName: 'Y Ltd',
      matchType: 'manual',
    });

    expect(next.failed).toHaveLength(0);
    expect(next.matched.map((t) => t.checksum)).toEqual(['failed-1']);
  });

  it('never mutates the skipped bucket and leaves unrelated buckets referentially intact', () => {
    const skipped = makeProcessed('skip-1', { status: 'skipped' });
    const target = makeProcessed('unknown-2', { status: 'uncertain' });
    const prev = emptyState({ uncertain: [target], skipped: [skipped] });

    const next = moveOneToMatched(prev, {
      transaction: target,
      entityId: 'ent-z',
      entityName: 'Z GmbH',
      matchType: 'manual',
    });

    expect(next.skipped).toBe(prev.skipped);
    expect(next.skipped).toEqual([skipped]);
  });

  it('collapses pre-existing duplicate matched entries down to a single copy at the first position', () => {
    const dupeA = makeProcessed('dupe', {
      status: 'matched',
      description: 'FIRST COPY',
      entity: { matchType: 'learned' },
    });
    const dupeB = makeProcessed('dupe', {
      status: 'matched',
      description: 'SECOND COPY',
      entity: { matchType: 'ai' },
    });
    const other = makeProcessed('other', { status: 'matched' });
    // Corrupted prior state: two entries share the same checksum.
    const prev = emptyState({ matched: [dupeA, other, dupeB] });

    const next = moveOneToMatched(prev, {
      transaction: dupeA,
      entityId: 'ent-dupe',
      entityName: 'Deduped Co',
      matchType: 'manual',
    });

    expect(next.matched.filter((t) => t.checksum === 'dupe')).toHaveLength(1);
    // Single survivor sits at the first duplicate's original index (0).
    expect(next.matched[0]?.checksum).toBe('dupe');
    expect(next.matched[0]?.entity.entityName).toBe('Deduped Co');
    // The unrelated matched row is preserved once, after the collapsed entry.
    expect(next.matched.map((t) => t.checksum)).toEqual(['dupe', 'other']);
  });

  it('re-selecting the same entity twice is idempotent — no growth on repeated picks', () => {
    const target = makeProcessed('dedupe', { status: 'matched', entity: { matchType: 'manual' } });
    const prev = emptyState({ matched: [target] });

    const args = {
      transaction: target,
      entityId: 'ent-a',
      entityName: 'A',
      matchType: 'manual' as const,
    };
    const once = moveOneToMatched(prev, args);
    const twice = moveOneToMatched(once, { ...args, transaction: once.matched[0] ?? target });

    expect(twice.matched).toHaveLength(1);
    expect(twice.matched[0]?.entity.entityId).toBe('ent-a');
  });
});
