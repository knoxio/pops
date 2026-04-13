/**
 * useLocalOps — manages client-side correction rule operations.
 *
 * Extracted from CorrectionProposalDialog (tb-364).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  CorrectionSignal,
  LocalOp,
  OpKind,
  ServerChangeSet,
  ServerChangeSetOp,
} from '../correction-proposal-shared';
import type { CorrectionRule } from '../RulePicker';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let clientIdCounter = 0;
export function newClientId(prefix: OpKind): string {
  clientIdCounter += 1;
  return `${prefix}-${clientIdCounter}-${Date.now().toString(36)}`;
}

/**
 * Convert a server ChangeSet op into its client-side counterpart. For
 * `edit`/`disable`/`remove` ops we hydrate `targetRule` from the
 * `targetRules` map returned alongside the proposal (or revise) response
 * so the preview-scoping filter in the dialog can correctly match
 * existing-rule patterns against the current import's transactions.
 */
export function serverOpToLocalOp(
  op: ServerChangeSetOp,
  targetRules: Record<string, CorrectionRule>
): LocalOp {
  if (op.op === 'add') {
    return { kind: 'add', clientId: newClientId('add'), data: op.data, dirty: false };
  }
  const hydrated = targetRules[op.id] ?? null;
  if (op.op === 'edit') {
    return {
      kind: 'edit',
      clientId: newClientId('edit'),
      targetRuleId: op.id,
      targetRule: hydrated,
      data: op.data,
      dirty: false,
    };
  }
  if (op.op === 'disable') {
    return {
      kind: 'disable',
      clientId: newClientId('disable'),
      targetRuleId: op.id,
      targetRule: hydrated,
      rationale: '',
      dirty: false,
    };
  }
  return {
    kind: 'remove',
    clientId: newClientId('remove'),
    targetRuleId: op.id,
    targetRule: hydrated,
    rationale: '',
    dirty: false,
  };
}

export function localOpToServerOp(op: LocalOp): ServerChangeSetOp {
  if (op.kind === 'add') return { op: 'add', data: op.data };
  if (op.kind === 'edit') return { op: 'edit', id: op.targetRuleId, data: op.data };
  if (op.kind === 'disable') return { op: 'disable', id: op.targetRuleId };
  return { op: 'remove', id: op.targetRuleId };
}

export function localOpsToChangeSet(
  ops: LocalOp[],
  extras?: { source?: string; reason?: string }
): ServerChangeSet | null {
  if (ops.length === 0) return null;
  return {
    source: extras?.source ?? 'correction-proposal-dialog',
    reason: extras?.reason,
    ops: ops.map(localOpToServerOp),
  };
}

function newAddOpFromSignal(signal: CorrectionSignal): LocalOp {
  return {
    kind: 'add',
    clientId: newClientId('add'),
    data: {
      descriptionPattern: signal.descriptionPattern,
      matchType: signal.matchType,
      entityId: signal.entityId ?? undefined,
      entityName: signal.entityName ?? undefined,
      location: signal.location ?? undefined,
      tags: signal.tags ?? [],
      transactionType: signal.transactionType ?? undefined,
    },
    dirty: true,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseLocalOpsOptions {
  open: boolean;
  signal: CorrectionSignal | null;
  isBrowseMode: boolean;
  proposeData:
    | {
        changeSet: { ops: ServerChangeSetOp[] };
        targetRules?: Record<string, CorrectionRule>;
        rationale?: string | null;
      }
    | undefined;
}

export interface UseLocalOpsReturn {
  localOps: LocalOp[];
  setLocalOps: React.Dispatch<React.SetStateAction<LocalOp[]>>;
  selectedClientId: string | null;
  setSelectedClientId: React.Dispatch<React.SetStateAction<string | null>>;
  selectedOp: LocalOp | null;
  hasDirty: boolean;
  rationale: string | null;
  setRationale: React.Dispatch<React.SetStateAction<string | null>>;
  updateOp: (clientId: string, mutator: (op: LocalOp) => LocalOp) => void;
  handleDeleteOp: (clientId: string) => void;
  handleAddNewRuleOp: () => void;
  handleAddTargetedOp: (kind: 'edit' | 'disable' | 'remove', rule: CorrectionRule) => void;
  /** Ref used by seeding effect — exposed for reset on dialog close. */
  seededForSignalRef: React.MutableRefObject<string | null>;
}

export function useLocalOps(options: UseLocalOpsOptions): UseLocalOpsReturn {
  const { open, signal, isBrowseMode, proposeData } = options;

  const [localOps, setLocalOps] = useState<LocalOp[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [rationale, setRationale] = useState<string | null>(null);

  const selectedOp = useMemo(
    () => localOps.find((o) => o.clientId === selectedClientId) ?? null,
    [localOps, selectedClientId]
  );

  const hasDirty = useMemo(() => localOps.some((o) => o.dirty), [localOps]);

  // Seed localOps from the initial proposal exactly once per open.
  const seededForSignalRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      seededForSignalRef.current = null;
      return;
    }
    if (!proposeData) return;
    const signalKey = JSON.stringify(signal);
    if (seededForSignalRef.current === signalKey) return;
    seededForSignalRef.current = signalKey;

    const seeded = proposeData.changeSet.ops.map((o) =>
      serverOpToLocalOp(o, proposeData.targetRules ?? {})
    );
    const clean = seeded.map((o) => ({ ...o, dirty: false }));
    setLocalOps(clean);
    setSelectedClientId(clean[0]?.clientId ?? null);
    setRationale(proposeData.rationale ?? null);
  }, [open, signal, proposeData]);

  const updateOp = useCallback((clientId: string, mutator: (op: LocalOp) => LocalOp) => {
    setLocalOps((prev) =>
      prev.map((o) => (o.clientId === clientId ? { ...mutator(o), dirty: true } : o))
    );
  }, []);

  const handleDeleteOp = useCallback(
    (clientId: string) => {
      setLocalOps((prev) => prev.filter((o) => o.clientId !== clientId));
      setSelectedClientId((prevSelected) => {
        if (prevSelected !== clientId) return prevSelected;
        const remaining = localOps.filter((o) => o.clientId !== clientId);
        return remaining[0]?.clientId ?? null;
      });
    },
    [localOps]
  );

  const handleAddNewRuleOp = useCallback(() => {
    if (isBrowseMode) {
      const newOp: LocalOp = {
        kind: 'add',
        clientId: newClientId('add'),
        data: { descriptionPattern: '', matchType: 'contains', tags: [] },
        dirty: true,
      };
      setLocalOps((prev) => [...prev, newOp]);
      setSelectedClientId(newOp.clientId);
      return;
    }
    if (!signal) return;
    const newOp = newAddOpFromSignal(signal);
    setLocalOps((prev) => [...prev, newOp]);
    setSelectedClientId(newOp.clientId);
  }, [signal, isBrowseMode]);

  const handleAddTargetedOp = useCallback(
    (kind: 'edit' | 'disable' | 'remove', rule: CorrectionRule) => {
      let newOp: LocalOp;
      if (kind === 'edit') {
        newOp = {
          kind: 'edit',
          clientId: newClientId('edit'),
          targetRuleId: rule.id,
          targetRule: rule,
          data: {
            entityId: rule.entityId ?? undefined,
            entityName: rule.entityName ?? undefined,
            location: rule.location ?? undefined,
            tags: rule.tags,
            transactionType: rule.transactionType ?? undefined,
            isActive: rule.isActive,
            confidence: rule.confidence,
          },
          dirty: true,
        };
      } else if (kind === 'disable') {
        newOp = {
          kind: 'disable',
          clientId: newClientId('disable'),
          targetRuleId: rule.id,
          targetRule: rule,
          rationale: '',
          dirty: true,
        };
      } else {
        newOp = {
          kind: 'remove',
          clientId: newClientId('remove'),
          targetRuleId: rule.id,
          targetRule: rule,
          rationale: '',
          dirty: true,
        };
      }
      setLocalOps((prev) => [...prev, newOp]);
      setSelectedClientId(newOp.clientId);
    },
    []
  );

  return {
    localOps,
    setLocalOps,
    selectedClientId,
    setSelectedClientId,
    selectedOp,
    hasDirty,
    rationale,
    setRationale,
    updateOp,
    handleDeleteOp,
    handleAddNewRuleOp,
    handleAddTargetedOp,
    seededForSignalRef,
  };
}
