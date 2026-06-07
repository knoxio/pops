/**
 * Unit tests for changeset builders.
 *
 * Locks the regression that left `IMPERIAL HOTEL → Imperial Hotel Erskineville`
 * stuck in Uncertain: when a proposal targets an existing low-confidence row,
 * the edit op must promote `confidence` above the matcher's `minConfidence`
 * threshold and force `isActive: true`. Otherwise the rule is filtered out by
 * `findAllMatchingCorrectionFromRules` (pure-service.ts) and the txn never
 * leaves Uncertain even after the user accepts the proposal.
 */
import { describe, expect, it } from 'vitest';

import {
  PROPOSAL_APPROVED_CONFIDENCE,
  buildAddChangeSet,
  buildEditChangeSet,
} from './changeset-builders.js';

import type { CorrectionRow, CorrectionSignal } from '../types.js';

function makeSignal(overrides: Partial<CorrectionSignal> = {}): CorrectionSignal {
  return {
    descriptionPattern: 'IMPERIAL HOTEL',
    matchType: 'contains',
    entityId: 'entity-1',
    entityName: 'Imperial Hotel Erskineville',
    location: null,
    tags: [],
    transactionType: null,
    ...overrides,
  };
}

function makeExistingRow(overrides: Partial<CorrectionRow> = {}): CorrectionRow {
  return {
    id: 'rule-1',
    descriptionPattern: 'IMPERIAL HOTEL',
    matchType: 'contains',
    entityId: null,
    entityName: null,
    location: null,
    tags: '[]',
    transactionType: null,
    confidence: 0.5,
    isActive: true,
    priority: 0,
    timesApplied: 0,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    ...overrides,
  };
}

const baseBuildArgs = {
  normalizedPattern: 'IMPERIAL HOTEL',
  matchType: 'contains' as const,
  hasFeedback: false,
};

describe('buildEditChangeSet', () => {
  it('promotes a sub-threshold rule above the matcher minConfidence', () => {
    const existing = makeExistingRow({ confidence: 0.5 });
    const cs = buildEditChangeSet(existing, {
      ...baseBuildArgs,
      effectiveSignal: makeSignal(),
    });

    const editOp = cs.ops[0];
    if (!editOp || editOp.op !== 'edit') throw new Error('expected edit op');
    expect(editOp.data.confidence).toBe(PROPOSAL_APPROVED_CONFIDENCE);
    expect(editOp.data.isActive).toBe(true);
    // Confidence must be strictly above the 0.7 default minConfidence so the
    // rule is eligible after the changeset is merged.
    expect(editOp.data.confidence ?? 0).toBeGreaterThan(0.7);
  });

  it('does not downgrade an already-high confidence rule', () => {
    const existing = makeExistingRow({ confidence: 0.99 });
    const cs = buildEditChangeSet(existing, {
      ...baseBuildArgs,
      effectiveSignal: makeSignal(),
    });

    const editOp = cs.ops[0];
    if (!editOp || editOp.op !== 'edit') throw new Error('expected edit op');
    expect(editOp.data.confidence).toBe(0.99);
  });

  it('reactivates a previously-disabled rule the user is re-approving', () => {
    const existing = makeExistingRow({ isActive: false, confidence: 0.95 });
    const cs = buildEditChangeSet(existing, {
      ...baseBuildArgs,
      effectiveSignal: makeSignal(),
    });

    const editOp = cs.ops[0];
    if (!editOp || editOp.op !== 'edit') throw new Error('expected edit op');
    expect(editOp.data.isActive).toBe(true);
  });

  it('forwards the signal entity/location/tags/transactionType', () => {
    const signal = makeSignal({
      entityId: 'entity-9',
      entityName: 'New Entity',
      location: 'Sydney',
      tags: ['food'],
      transactionType: 'purchase',
    });
    const cs = buildEditChangeSet(makeExistingRow(), {
      ...baseBuildArgs,
      effectiveSignal: signal,
    });

    const editOp = cs.ops[0];
    if (!editOp || editOp.op !== 'edit') throw new Error('expected edit op');
    expect(editOp.data).toMatchObject({
      entityId: 'entity-9',
      entityName: 'New Entity',
      location: 'Sydney',
      tags: ['food'],
      transactionType: 'purchase',
    });
  });
});

describe('buildAddChangeSet', () => {
  it('uses the shared approved-confidence constant', () => {
    const cs = buildAddChangeSet({
      ...baseBuildArgs,
      effectiveSignal: makeSignal(),
    });
    const addOp = cs.ops[0];
    if (!addOp || addOp.op !== 'add') throw new Error('expected add op');
    expect(addOp.data.confidence).toBe(PROPOSAL_APPROVED_CONFIDENCE);
    expect(addOp.data.isActive).toBe(true);
  });
});
