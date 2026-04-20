/**
 * useLocalOps — manages client-side correction rule operations.
 *
 * Extracted from CorrectionProposalDialog (tb-364).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  newAddOpFromSignal,
  newClientId,
  newTargetedOp,
  serverOpToLocalOp,
} from './local-ops-helpers';

import type { CorrectionSignal, LocalOp, ServerChangeSetOp } from '../correction-proposal-shared';
import type { CorrectionRule } from '../RulePicker';

export {
  localOpToServerOp,
  localOpsToChangeSet,
  newClientId,
  serverOpToLocalOp,
} from './local-ops-helpers';

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
  seededForSignalRef: React.MutableRefObject<string | null>;
}

function useSeedFromProposal(
  options: UseLocalOpsOptions,
  setLocalOps: React.Dispatch<React.SetStateAction<LocalOp[]>>,
  setSelectedClientId: React.Dispatch<React.SetStateAction<string | null>>,
  setRationale: React.Dispatch<React.SetStateAction<string | null>>
) {
  const seededForSignalRef = useRef<string | null>(null);
  useEffect(() => {
    if (!options.open) {
      seededForSignalRef.current = null;
      return;
    }
    if (!options.proposeData) return;
    const signalKey = JSON.stringify(options.signal);
    if (seededForSignalRef.current === signalKey) return;
    seededForSignalRef.current = signalKey;
    const seeded = options.proposeData.changeSet.ops.map((o) =>
      serverOpToLocalOp(o, options.proposeData?.targetRules ?? {})
    );
    const clean = seeded.map((o) => ({ ...o, dirty: false }));
    setLocalOps(clean);
    setSelectedClientId(clean[0]?.clientId ?? null);
    setRationale(options.proposeData.rationale ?? null);
  }, [
    options.open,
    options.signal,
    options.proposeData,
    setLocalOps,
    setSelectedClientId,
    setRationale,
  ]);
  return seededForSignalRef;
}

function useAddOps(
  signal: CorrectionSignal | null,
  isBrowseMode: boolean,
  setLocalOps: React.Dispatch<React.SetStateAction<LocalOp[]>>,
  setSelectedClientId: React.Dispatch<React.SetStateAction<string | null>>
) {
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
  }, [signal, isBrowseMode, setLocalOps, setSelectedClientId]);

  const handleAddTargetedOp = useCallback(
    (kind: 'edit' | 'disable' | 'remove', rule: CorrectionRule) => {
      const newOp = newTargetedOp(kind, rule);
      setLocalOps((prev) => [...prev, newOp]);
      setSelectedClientId(newOp.clientId);
    },
    [setLocalOps, setSelectedClientId]
  );

  return { handleAddNewRuleOp, handleAddTargetedOp };
}

export function useLocalOps(options: UseLocalOpsOptions): UseLocalOpsReturn {
  const { signal, isBrowseMode } = options;
  const [localOps, setLocalOps] = useState<LocalOp[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [rationale, setRationale] = useState<string | null>(null);

  const selectedOp = useMemo(
    () => localOps.find((o) => o.clientId === selectedClientId) ?? null,
    [localOps, selectedClientId]
  );
  const hasDirty = useMemo(() => localOps.some((o) => o.dirty), [localOps]);

  const seededForSignalRef = useSeedFromProposal(
    options,
    setLocalOps,
    setSelectedClientId,
    setRationale
  );

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

  const { handleAddNewRuleOp, handleAddTargetedOp } = useAddOps(
    signal,
    isBrowseMode,
    setLocalOps,
    setSelectedClientId
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
