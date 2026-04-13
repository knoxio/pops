import type { ChangeSet } from '@pops/api/modules/core/corrections/types';
import type { ConfirmedTransaction } from '@pops/api/modules/finance/imports';
import { describe, expect, it } from 'vitest';

import type { PendingChangeSet, PendingEntity } from '../store/importStore';
import { buildCommitPayload, type DanglingEntityRefError } from './commit-payload';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePendingEntity(overrides: Partial<PendingEntity> = {}): PendingEntity {
  return {
    tempId: `temp:entity:${crypto.randomUUID()}`,
    name: 'Test Merchant',
    type: 'company',
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

function makeConfirmedTransaction(
  overrides: Partial<ConfirmedTransaction> = {}
): ConfirmedTransaction {
  return {
    date: '2026-01-15',
    description: 'WOOLWORTHS',
    amount: -42.5,
    account: 'Amex',
    rawRow: '{}',
    checksum: `chk-${crypto.randomUUID().slice(0, 8)}`,
    entityId: 'entity-1',
    entityName: 'Woolworths',
    transactionType: 'purchase',
    tags: [],
    ...overrides,
  };
}

const sampleChangeSet: ChangeSet = {
  source: 'test',
  reason: 'unit test',
  ops: [{ op: 'add', data: { descriptionPattern: 'TEST', matchType: 'exact' } }],
};

// ---------------------------------------------------------------------------
// Tests — PRD-030 US-09
// ---------------------------------------------------------------------------

describe('buildCommitPayload', () => {
  it('returns empty payload when no pending data', () => {
    const payload = buildCommitPayload([], [], []);
    expect(payload.entities).toEqual([]);
    expect(payload.changeSets).toEqual([]);
    expect(payload.transactions).toEqual([]);
  });

  it('returns entities only when no changeSets or transactions', () => {
    const entity = makePendingEntity({ name: 'Coles' });
    const payload = buildCommitPayload([entity], [], []);
    expect(payload.entities).toHaveLength(1);
    expect(payload.entities[0].name).toBe('Coles');
    expect(payload.changeSets).toEqual([]);
    expect(payload.transactions).toEqual([]);
  });

  it('returns changeSets only when no entities or transactions', () => {
    const pcs = makePendingChangeSet(sampleChangeSet);
    const payload = buildCommitPayload([], [pcs], []);
    expect(payload.entities).toEqual([]);
    expect(payload.changeSets).toHaveLength(1);
    expect(payload.changeSets[0]).toEqual(sampleChangeSet);
    expect(payload.transactions).toEqual([]);
  });

  it('returns mixed payload with temp entity references in changeSets', () => {
    const entity = makePendingEntity({ name: 'New Corp' });
    const cs: ChangeSet = {
      source: 'test',
      ops: [
        {
          op: 'add',
          data: {
            descriptionPattern: 'NEW CORP',
            matchType: 'exact',
            entityId: entity.tempId,
            entityName: 'New Corp',
          },
        },
      ],
    };
    const pcs = makePendingChangeSet(cs);
    const txn = makeConfirmedTransaction({ entityId: entity.tempId, entityName: 'New Corp' });

    const payload = buildCommitPayload([entity], [pcs], [txn]);
    expect(payload.entities).toHaveLength(1);
    expect(payload.changeSets).toHaveLength(1);
    expect(payload.transactions).toHaveLength(1);
    expect(payload.transactions[0].entityId).toBe(entity.tempId);
  });

  it('throws descriptive error for dangling entity reference in add op', () => {
    const danglingId = 'temp:entity:does-not-exist';
    const cs: ChangeSet = {
      source: 'test',
      ops: [
        {
          op: 'add',
          data: {
            descriptionPattern: 'BAD',
            matchType: 'exact',
            entityId: danglingId,
          },
        },
      ],
    };
    const pcs = makePendingChangeSet(cs);

    expect(() => buildCommitPayload([], [pcs], [])).toThrow(/Dangling entity reference/);

    try {
      buildCommitPayload([], [pcs], []);
    } catch (err) {
      const e = err as Error & DanglingEntityRefError;
      expect(e.type).toBe('dangling-entity-ref');
      expect(e.tempId).toBe(danglingId);
      expect(e.changeSetTempId).toBe(pcs.tempId);
    }
  });

  it('throws descriptive error for dangling entity reference in edit op', () => {
    const danglingId = 'temp:entity:missing';
    const cs: ChangeSet = {
      source: 'test',
      ops: [{ op: 'edit', id: 'rule-1', data: { entityId: danglingId } }],
    };
    const pcs = makePendingChangeSet(cs);

    expect(() => buildCommitPayload([], [pcs], [])).toThrow(/Dangling entity reference/);
  });

  it('does not throw for non-temp entity IDs in changeSets', () => {
    const cs: ChangeSet = {
      source: 'test',
      ops: [
        {
          op: 'add',
          data: {
            descriptionPattern: 'OK',
            matchType: 'exact',
            entityId: 'real-entity-id',
          },
        },
      ],
    };
    const pcs = makePendingChangeSet(cs);
    expect(() => buildCommitPayload([], [pcs], [])).not.toThrow();
  });

  it('preserves ChangeSet insertion order', () => {
    const pcs1 = makePendingChangeSet(
      {
        source: 'first',
        ops: [{ op: 'add', data: { descriptionPattern: 'A', matchType: 'exact' } }],
      },
      { appliedAt: '2026-04-12T01:00:00Z' }
    );
    const pcs2 = makePendingChangeSet(
      {
        source: 'second',
        ops: [{ op: 'add', data: { descriptionPattern: 'B', matchType: 'exact' } }],
      },
      { appliedAt: '2026-04-12T02:00:00Z' }
    );
    const pcs3 = makePendingChangeSet(
      {
        source: 'third',
        ops: [{ op: 'add', data: { descriptionPattern: 'C', matchType: 'exact' } }],
      },
      { appliedAt: '2026-04-12T03:00:00Z' }
    );

    const payload = buildCommitPayload([], [pcs1, pcs2, pcs3], []);
    expect(payload.changeSets.map((cs) => cs.source)).toEqual(['first', 'second', 'third']);
  });

  it('includes confirmed transactions with temp entity IDs intact', () => {
    const entity = makePendingEntity({ name: 'Temp Corp' });
    const txn1 = makeConfirmedTransaction({ entityId: entity.tempId, entityName: 'Temp Corp' });
    const txn2 = makeConfirmedTransaction({ entityId: 'real-id', entityName: 'Real Corp' });

    const payload = buildCommitPayload([entity], [], [txn1, txn2]);
    expect(payload.transactions).toHaveLength(2);
    expect(payload.transactions[0].entityId).toBe(entity.tempId);
    expect(payload.transactions[1].entityId).toBe('real-id');
  });

  it('passes through transactions with dangling temp entity IDs (commit endpoint resolves them)', () => {
    const danglingTempId = 'temp:entity:not-in-pending-list';
    const txn = makeConfirmedTransaction({
      entityId: danglingTempId,
      entityName: 'Phantom Corp',
    });

    // Transactions are NOT validated — only ChangeSet ops are.
    // Temp entity ID resolution in transactions is the commit endpoint's job.
    const payload = buildCommitPayload([], [], [txn]);
    expect(payload.transactions).toHaveLength(1);
    expect(payload.transactions[0].entityId).toBe(danglingTempId);
  });

  it('returns a snapshot, not a live reference', () => {
    const entities = [makePendingEntity()];
    const changeSets = [makePendingChangeSet(sampleChangeSet)];
    const transactions = [makeConfirmedTransaction()];

    const payload = buildCommitPayload(entities, changeSets, transactions);

    // Mutating the input arrays should not affect the payload
    entities.push(makePendingEntity({ name: 'Extra' }));
    changeSets.push(makePendingChangeSet(sampleChangeSet));
    transactions.push(makeConfirmedTransaction());

    expect(payload.entities).toHaveLength(1);
    expect(payload.changeSets).toHaveLength(1);
    expect(payload.transactions).toHaveLength(1);
  });
});
