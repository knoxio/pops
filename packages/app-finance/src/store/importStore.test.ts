import { beforeEach, describe, expect, it } from 'vitest';

import { type ChangeSet, type ProcessedTransaction, useImportStore } from './importStore';

import type { ParsedTransaction } from '@pops/api/modules/finance/imports';

// ---------------------------------------------------------------------------
// importStore — parsedTransactionsFingerprint / processedForFingerprint tests
// ---------------------------------------------------------------------------

function makeTxn(checksum: string, description = 'WOOLWORTHS'): ParsedTransaction {
  return {
    date: '2026-01-15',
    description,
    amount: -42.5,
    account: 'Amex',
    rawRow: `{"checksum":"${checksum}"}`,
    checksum,
  };
}

const sampleProcessed = (): {
  matched: ProcessedTransaction[];
  uncertain: ProcessedTransaction[];
  failed: ProcessedTransaction[];
  skipped: ProcessedTransaction[];
} => ({
  matched: [{ description: 'WOOLWORTHS' } as unknown as ProcessedTransaction],
  uncertain: [],
  failed: [],
  skipped: [],
});

describe('importStore — parsed/processed fingerprint', () => {
  beforeEach(() => {
    useImportStore.getState().reset();
  });

  it('empty parsed list yields empty fingerprint', () => {
    useImportStore.getState().setParsedTransactions([]);
    expect(useImportStore.getState().parsedTransactionsFingerprint).toBe('');
  });

  it('computes a fingerprint from the concatenated checksums', () => {
    const txns = [makeTxn('a'), makeTxn('b'), makeTxn('c')];
    useImportStore.getState().setParsedTransactions(txns);
    expect(useImportStore.getState().parsedTransactionsFingerprint).toBe('a|b|c');
  });

  it('different checksum order yields a different fingerprint', () => {
    useImportStore.getState().setParsedTransactions([makeTxn('a'), makeTxn('b')]);
    const first = useImportStore.getState().parsedTransactionsFingerprint;
    useImportStore.getState().setParsedTransactions([makeTxn('b'), makeTxn('a')]);
    expect(useImportStore.getState().parsedTransactionsFingerprint).not.toBe(first);
  });

  it('re-setting an identical parsed list is a no-op for downstream processed state', () => {
    const txns = [makeTxn('a'), makeTxn('b')];
    useImportStore.getState().setParsedTransactions(txns);
    useImportStore.getState().setProcessedTransactions({
      ...sampleProcessed(),
      warnings: undefined,
    });
    const fp = useImportStore.getState().parsedTransactionsFingerprint;
    expect(useImportStore.getState().processedForFingerprint).toBe(fp);

    useImportStore.getState().setParsedTransactions([makeTxn('a'), makeTxn('b')]);

    expect(useImportStore.getState().processedTransactions.matched).toHaveLength(1);
    expect(useImportStore.getState().processedForFingerprint).toBe(fp);
    expect(useImportStore.getState().parsedTransactionsFingerprint).toBe(fp);
  });

  it('setting a changed parsed list invalidates processed state and clears processedForFingerprint', () => {
    useImportStore.getState().setParsedTransactions([makeTxn('a')]);
    useImportStore.getState().setProcessedTransactions({
      ...sampleProcessed(),
      warnings: undefined,
    });
    expect(useImportStore.getState().processedForFingerprint).not.toBeNull();

    useImportStore.getState().setParsedTransactions([makeTxn('x'), makeTxn('y')]);

    const state = useImportStore.getState();
    expect(state.parsedTransactionsFingerprint).toBe('x|y');
    expect(state.processedForFingerprint).toBeNull();
    expect(state.processedTransactions.matched).toHaveLength(0);
    expect(state.processedTransactions.uncertain).toHaveLength(0);
    expect(state.processedTransactions.failed).toHaveLength(0);
    expect(state.processedTransactions.skipped).toHaveLength(0);
  });

  it('setProcessedTransactions pins processedForFingerprint to the current parsed fingerprint', () => {
    useImportStore.getState().setParsedTransactions([makeTxn('z')]);
    useImportStore.getState().setProcessedTransactions({
      ...sampleProcessed(),
      warnings: undefined,
    });
    expect(useImportStore.getState().processedForFingerprint).toBe('z');
  });

  it('setFile with a different file resets fingerprints and processed state', () => {
    useImportStore.getState().setParsedTransactions([makeTxn('a')]);
    useImportStore.getState().setProcessedTransactions({
      ...sampleProcessed(),
      warnings: undefined,
    });

    const fakeFile = { name: 'new.csv', size: 10, lastModified: 1 } as unknown as File;
    useImportStore.getState().setFile(fakeFile);

    const state = useImportStore.getState();
    expect(state.parsedTransactionsFingerprint).toBe('');
    expect(state.processedForFingerprint).toBeNull();
    expect(state.processedTransactions.matched).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Step range — currentStep supports 1..7 (PRD-031 adds step 7)
// ---------------------------------------------------------------------------

describe('importStore — step range', () => {
  beforeEach(() => {
    useImportStore.getState().reset();
  });

  it('nextStep caps at 7', () => {
    useImportStore.getState().goToStep(6);
    useImportStore.getState().nextStep();
    expect(useImportStore.getState().currentStep).toBe(7);
    useImportStore.getState().nextStep();
    expect(useImportStore.getState().currentStep).toBe(7);
  });

  it('prevStep floors at 1', () => {
    useImportStore.getState().goToStep(1);
    useImportStore.getState().prevStep();
    expect(useImportStore.getState().currentStep).toBe(1);
  });

  it('goToStep sets arbitrary step', () => {
    useImportStore.getState().goToStep(5);
    expect(useImportStore.getState().currentStep).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Pending entities (PRD-030 US-01)
// ---------------------------------------------------------------------------

const sampleChangeSet: ChangeSet = {
  source: 'ai',
  reason: 'test',
  ops: [{ op: 'add', data: { descriptionPattern: 'TEST', matchType: 'exact' } }],
};

describe('importStore — pendingEntities (PRD-030 US-01)', () => {
  beforeEach(() => {
    useImportStore.getState().reset();
  });

  it('starts with an empty array', () => {
    expect(useImportStore.getState().pendingEntities).toEqual([]);
  });

  it('addPendingEntity generates a temp ID in the format temp:entity:{uuid}', () => {
    const entity = useImportStore.getState().addPendingEntity({
      name: 'Test Merchant',
      type: 'company',
    });
    expect(entity.tempId).toMatch(/^temp:entity:[0-9a-f-]{36}$/);
    expect(entity.name).toBe('Test Merchant');
    expect(entity.type).toBe('company');
  });

  it('addPendingEntity appends to the pending list in insertion order', () => {
    useImportStore.getState().addPendingEntity({ name: 'First', type: 'company' });
    useImportStore.getState().addPendingEntity({ name: 'Second', type: 'person' });

    const entities = useImportStore.getState().pendingEntities;
    expect(entities).toHaveLength(2);
    expect(entities[0].name).toBe('First');
    expect(entities[1].name).toBe('Second');
  });

  it('addPendingEntity rejects duplicate name in pending list (case-insensitive)', () => {
    useImportStore.getState().addPendingEntity({ name: 'Woolworths', type: 'company' });

    expect(() =>
      useImportStore.getState().addPendingEntity({ name: 'woolworths', type: 'company' })
    ).toThrow(/already exists in pending list/);

    expect(useImportStore.getState().pendingEntities).toHaveLength(1);
  });

  it('addPendingEntity rejects duplicate name in DB entity list (case-insensitive)', () => {
    const dbEntities = [{ name: 'Coles' }, { name: 'Woolworths' }];

    expect(() =>
      useImportStore.getState().addPendingEntity({ name: 'coles', type: 'company' }, dbEntities)
    ).toThrow(/already exists in the database/);

    expect(useImportStore.getState().pendingEntities).toHaveLength(0);
  });

  it('removePendingEntity removes by tempId', () => {
    const e1 = useImportStore.getState().addPendingEntity({ name: 'First', type: 'company' });
    useImportStore.getState().addPendingEntity({ name: 'Second', type: 'company' });

    useImportStore.getState().removePendingEntity(e1.tempId);

    const entities = useImportStore.getState().pendingEntities;
    expect(entities).toHaveLength(1);
    expect(entities[0].name).toBe('Second');
  });

  it('removePendingEntity with unknown id is a no-op', () => {
    useImportStore.getState().addPendingEntity({ name: 'First', type: 'company' });
    useImportStore.getState().removePendingEntity('nonexistent');
    expect(useImportStore.getState().pendingEntities).toHaveLength(1);
  });

  it('listPendingEntities returns all pending entities in insertion order', () => {
    useImportStore.getState().addPendingEntity({ name: 'A', type: 'company' });
    useImportStore.getState().addPendingEntity({ name: 'B', type: 'person' });
    useImportStore.getState().addPendingEntity({ name: 'C', type: 'company' });

    const list = useImportStore.getState().listPendingEntities();
    expect(list.map((e) => e.name)).toEqual(['A', 'B', 'C']);
  });

  it('reset clears all pending entities', () => {
    useImportStore.getState().addPendingEntity({ name: 'Test', type: 'company' });
    useImportStore.getState().reset();
    expect(useImportStore.getState().pendingEntities).toEqual([]);
  });

  it('setFile with a different file clears pending entities', () => {
    useImportStore.getState().addPendingEntity({ name: 'Test', type: 'company' });
    const fakeFile = { name: 'new.csv', size: 10, lastModified: 1 } as unknown as File;
    useImportStore.getState().setFile(fakeFile);
    expect(useImportStore.getState().pendingEntities).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Pending changeSets (PRD-030 US-02)
// ---------------------------------------------------------------------------

describe('importStore — pendingChangeSets (PRD-030 US-02)', () => {
  beforeEach(() => {
    useImportStore.getState().reset();
  });

  it('starts with an empty array', () => {
    expect(useImportStore.getState().pendingChangeSets).toEqual([]);
  });

  it('addPendingChangeSet generates a temp ID in the format temp:changeset:{uuid}', () => {
    const entry = useImportStore.getState().addPendingChangeSet({
      changeSet: sampleChangeSet,
      source: 'correction-proposal',
    });
    expect(entry.tempId).toMatch(/^temp:changeset:[0-9a-f-]{36}$/);
    expect(entry.changeSet).toEqual(sampleChangeSet);
    expect(entry.source).toBe('correction-proposal');
    expect(entry.appliedAt).toBeTruthy();
  });

  it('addPendingChangeSet appends in insertion order', () => {
    useImportStore.getState().addPendingChangeSet({
      changeSet: sampleChangeSet,
      source: 'first',
    });
    useImportStore.getState().addPendingChangeSet({
      changeSet: sampleChangeSet,
      source: 'second',
    });

    const list = useImportStore.getState().pendingChangeSets;
    expect(list).toHaveLength(2);
    expect(list[0].source).toBe('first');
    expect(list[1].source).toBe('second');
  });

  it('listPendingChangeSets returns all in insertion order', () => {
    useImportStore.getState().addPendingChangeSet({
      changeSet: sampleChangeSet,
      source: 'a',
    });
    useImportStore.getState().addPendingChangeSet({
      changeSet: sampleChangeSet,
      source: 'b',
    });
    useImportStore.getState().addPendingChangeSet({
      changeSet: sampleChangeSet,
      source: 'c',
    });

    const list = useImportStore.getState().listPendingChangeSets();
    expect(list.map((cs) => cs.source)).toEqual(['a', 'b', 'c']);
  });

  it('removePendingChangeSet removes from the middle preserving order', () => {
    const cs1 = useImportStore.getState().addPendingChangeSet({
      changeSet: sampleChangeSet,
      source: 'first',
    });
    const cs2 = useImportStore.getState().addPendingChangeSet({
      changeSet: sampleChangeSet,
      source: 'second',
    });
    const cs3 = useImportStore.getState().addPendingChangeSet({
      changeSet: sampleChangeSet,
      source: 'third',
    });

    useImportStore.getState().removePendingChangeSet(cs2.tempId);

    const list = useImportStore.getState().pendingChangeSets;
    expect(list).toHaveLength(2);
    expect(list[0].tempId).toBe(cs1.tempId);
    expect(list[1].tempId).toBe(cs3.tempId);
  });

  it('removePendingChangeSet with unknown id is a no-op', () => {
    useImportStore.getState().addPendingChangeSet({
      changeSet: sampleChangeSet,
      source: 'test',
    });
    useImportStore.getState().removePendingChangeSet('nonexistent');
    expect(useImportStore.getState().pendingChangeSets).toHaveLength(1);
  });

  it('reset clears all pending changeSets', () => {
    useImportStore.getState().addPendingChangeSet({
      changeSet: sampleChangeSet,
      source: 'test',
    });
    useImportStore.getState().reset();
    expect(useImportStore.getState().pendingChangeSets).toEqual([]);
  });

  it('setFile with a different file clears pending changeSets', () => {
    useImportStore.getState().addPendingChangeSet({
      changeSet: sampleChangeSet,
      source: 'test',
    });
    const fakeFile = { name: 'new.csv', size: 10, lastModified: 1 } as unknown as File;
    useImportStore.getState().setFile(fakeFile);
    expect(useImportStore.getState().pendingChangeSets).toEqual([]);
  });
});
