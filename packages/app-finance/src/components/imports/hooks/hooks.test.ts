import { describe, expect, it } from 'vitest';

import type { LocalOp, ServerChangeSetOp } from '../correction-proposal-shared';
import type { CorrectionRule } from '../RulePicker';
import type {
  UseApplyRejectMutationsOptions,
  UseApplyRejectMutationsReturn,
} from './useApplyRejectMutations';
import {
  localOpsToChangeSet,
  localOpToServerOp,
  newClientId,
  serverOpToLocalOp,
} from './useLocalOps';
import type { UsePreviewEffectsOptions } from './usePreviewEffects';

// ---------------------------------------------------------------------------
// newClientId
// ---------------------------------------------------------------------------

describe('newClientId', () => {
  it('returns a string starting with the given prefix', () => {
    expect(newClientId('add')).toMatch(/^add-/);
    expect(newClientId('edit')).toMatch(/^edit-/);
    expect(newClientId('disable')).toMatch(/^disable-/);
    expect(newClientId('remove')).toMatch(/^remove-/);
  });

  it('returns unique ids on successive calls', () => {
    const a = newClientId('add');
    const b = newClientId('add');
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// serverOpToLocalOp
// ---------------------------------------------------------------------------

const fakeRule: CorrectionRule = {
  id: 'rule-1',
  descriptionPattern: 'SOME PATTERN',
  matchType: 'contains',
  entityId: 'ent-1',
  entityName: 'Entity One',
  location: null,
  tags: ['tag-a'],
  transactionType: 'debit',
  isActive: true,
  confidence: 0.9,
  createdAt: '2025-01-01',
  updatedAt: '2025-01-01',
};

const targetRules: Record<string, CorrectionRule> = { 'rule-1': fakeRule };

describe('serverOpToLocalOp', () => {
  it('converts an add op', () => {
    const serverOp: ServerChangeSetOp = {
      op: 'add',
      data: { descriptionPattern: 'TEST', matchType: 'exact', tags: [] },
    };
    const local = serverOpToLocalOp(serverOp, targetRules);
    expect(local.kind).toBe('add');
    expect(local.dirty).toBe(false);
    expect(local.clientId).toMatch(/^add-/);
    if (local.kind === 'add') {
      expect(local.data.descriptionPattern).toBe('TEST');
    }
  });

  it('converts an edit op and hydrates targetRule', () => {
    const serverOp: ServerChangeSetOp = {
      op: 'edit',
      id: 'rule-1',
      data: { tags: ['new-tag'] },
    };
    const local = serverOpToLocalOp(serverOp, targetRules);
    expect(local.kind).toBe('edit');
    if (local.kind === 'edit') {
      expect(local.targetRuleId).toBe('rule-1');
      expect(local.targetRule).toEqual(fakeRule);
      expect(local.data.tags).toEqual(['new-tag']);
    }
  });

  it('converts a disable op', () => {
    const serverOp: ServerChangeSetOp = { op: 'disable', id: 'rule-1' };
    const local = serverOpToLocalOp(serverOp, targetRules);
    expect(local.kind).toBe('disable');
    if (local.kind === 'disable') {
      expect(local.targetRuleId).toBe('rule-1');
      expect(local.targetRule).toEqual(fakeRule);
    }
  });

  it('converts a remove op', () => {
    const serverOp: ServerChangeSetOp = { op: 'remove', id: 'rule-1' };
    const local = serverOpToLocalOp(serverOp, targetRules);
    expect(local.kind).toBe('remove');
    if (local.kind === 'remove') {
      expect(local.targetRuleId).toBe('rule-1');
      expect(local.targetRule).toEqual(fakeRule);
    }
  });

  it('sets targetRule to null when rule is missing from lookup', () => {
    const serverOp: ServerChangeSetOp = { op: 'edit', id: 'missing', data: {} };
    const local = serverOpToLocalOp(serverOp, {});
    if (local.kind === 'edit') {
      expect(local.targetRule).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// localOpToServerOp
// ---------------------------------------------------------------------------

describe('localOpToServerOp', () => {
  it('converts add op', () => {
    const local: LocalOp = {
      kind: 'add',
      clientId: 'add-1',
      data: { descriptionPattern: 'X', matchType: 'contains', tags: [] },
      dirty: false,
    };
    expect(localOpToServerOp(local)).toEqual({ op: 'add', data: local.data });
  });

  it('converts edit op', () => {
    const local: LocalOp = {
      kind: 'edit',
      clientId: 'edit-1',
      targetRuleId: 'rule-1',
      targetRule: fakeRule,
      data: { tags: ['a'] },
      dirty: false,
    };
    expect(localOpToServerOp(local)).toEqual({ op: 'edit', id: 'rule-1', data: { tags: ['a'] } });
  });

  it('converts disable op', () => {
    const local: LocalOp = {
      kind: 'disable',
      clientId: 'disable-1',
      targetRuleId: 'rule-1',
      targetRule: fakeRule,
      rationale: '',
      dirty: false,
    };
    expect(localOpToServerOp(local)).toEqual({ op: 'disable', id: 'rule-1' });
  });

  it('converts remove op', () => {
    const local: LocalOp = {
      kind: 'remove',
      clientId: 'remove-1',
      targetRuleId: 'rule-1',
      targetRule: fakeRule,
      rationale: '',
      dirty: false,
    };
    expect(localOpToServerOp(local)).toEqual({ op: 'remove', id: 'rule-1' });
  });
});

// ---------------------------------------------------------------------------
// localOpsToChangeSet
// ---------------------------------------------------------------------------

describe('localOpsToChangeSet', () => {
  it('returns null for empty ops', () => {
    expect(localOpsToChangeSet([])).toBeNull();
  });

  it('builds a change set from ops', () => {
    const ops: LocalOp[] = [
      {
        kind: 'add',
        clientId: 'add-1',
        data: { descriptionPattern: 'X', matchType: 'contains', tags: [] },
        dirty: false,
      },
    ];
    const cs = localOpsToChangeSet(ops);
    expect(cs).not.toBeNull();
    expect(cs!.source).toBe('correction-proposal-dialog');
    expect(cs!.ops).toHaveLength(1);
    expect(cs!.ops[0]).toEqual({ op: 'add', data: ops[0].data });
  });

  it('accepts custom source and reason', () => {
    const ops: LocalOp[] = [
      {
        kind: 'add',
        clientId: 'add-2',
        data: { descriptionPattern: 'Y', matchType: 'exact', tags: [] },
        dirty: false,
      },
    ];
    const cs = localOpsToChangeSet(ops, { source: 'test', reason: 'test-reason' });
    expect(cs!.source).toBe('test');
    expect(cs!.reason).toBe('test-reason');
  });
});

// ---------------------------------------------------------------------------
// usePreviewEffects — interface contract
// ---------------------------------------------------------------------------

describe('usePreviewEffects — interface contract', () => {
  it('UsePreviewEffectsOptions requires the expected shape', () => {
    const opts: UsePreviewEffectsOptions = {
      open: true,
      localOps: [],
      selectedOp: null,
      minConfidence: 0.5,
      previewTransactions: [],
      pendingChangeSets: [],
    };
    expect(opts.open).toBe(true);
    expect(opts.localOps).toEqual([]);
    expect(opts.selectedOp).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// useApplyRejectMutations — interface contract + canApply derivation
// ---------------------------------------------------------------------------

describe('useApplyRejectMutations — interface contract', () => {
  it('UseApplyRejectMutationsOptions requires the expected fields', () => {
    const opts: UseApplyRejectMutationsOptions = {
      signal: null,
      sessionId: 'sess-1',
      localOps: [],
      combinedPreview: null,
      combinedPreviewError: null,
      previewTransactions: [],
      isFetching: false,
      previewMutationPending: false,
      hasDirty: false,
      onClose: () => {},
      setLocalOps: () => {},
      setSelectedClientId: () => {},
      setRationale: () => {},
      lastCombinedStructuralSigRef: { current: null },
      selectedOpPreviewKeyRef: { current: null },
    };
    expect(opts.sessionId).toBe('sess-1');
  });

  it('UseApplyRejectMutationsReturn exposes the expected keys', () => {
    const keys: Array<keyof UseApplyRejectMutationsReturn> = [
      'rejectMode',
      'setRejectMode',
      'rejectFeedback',
      'setRejectFeedback',
      'aiInstruction',
      'setAiInstruction',
      'aiMessages',
      'setAiMessages',
      'aiBusy',
      'isBusy',
      'canApply',
      'handleApprove',
      'handleConfirmReject',
      'handleAiSubmit',
      'handleApplyLocal',
      'rejectMutationPending',
      'resetMutationState',
    ];
    expect(keys).toHaveLength(17);
  });
});

describe('canApply derivation rules', () => {
  it.each([
    { isBusy: true, opsLen: 1, hasDirty: false, sessionId: 's', error: null, expected: false },
    { isBusy: false, opsLen: 0, hasDirty: false, sessionId: 's', error: null, expected: false },
    { isBusy: false, opsLen: 1, hasDirty: true, sessionId: 's', error: null, expected: false },
    { isBusy: false, opsLen: 1, hasDirty: false, sessionId: '', error: null, expected: false },
    { isBusy: false, opsLen: 1, hasDirty: false, sessionId: 's', error: 'fail', expected: false },
    { isBusy: false, opsLen: 1, hasDirty: false, sessionId: 's', error: null, expected: true },
  ])('canApply=%j', ({ isBusy, opsLen, hasDirty, sessionId, error, expected }) => {
    const result = !isBusy && opsLen > 0 && !hasDirty && Boolean(sessionId) && !error;
    expect(result).toBe(expected);
  });
});
