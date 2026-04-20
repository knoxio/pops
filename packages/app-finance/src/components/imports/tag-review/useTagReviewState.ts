import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { trpc } from '@pops/api-client';

import { useImportStore } from '../../../store/importStore';
import { groupByEntity } from './tagReviewUtils';
import {
  applyAffectedToLocalTags,
  applyAffectedToSuggested,
  useTagActions,
} from './useTagReviewActions';
import { type TagRuleDialogState, useTagRuleDialog } from './useTagRuleDialog';

import type { TagRuleChangeSet, TagRuleImpactItem } from '@pops/api/modules/core/tag-rules/types';
import type { ConfirmedTransaction, SuggestedTag } from '@pops/api/modules/finance/imports';

import type { ImportStore as ImportStoreType } from '../../../store/import-store-types';
import type { ConfirmedGroup } from './tagReviewUtils';

export interface UseTagReviewStateOutput {
  confirmedTransactions: ConfirmedTransaction[];
  groups: ConfirmedGroup[];
  availableTags: string[];
  localTags: Record<string, string[]>;
  suggestedTagMeta: Record<string, SuggestedTag[]>;
  updateTag: (checksum: string, tags: string[]) => void;
  handleAcceptAll: () => void;
  handleApplyGroupTags: (group: ConfirmedGroup, tags: string[]) => void;
  handleContinue: () => void;
  prevStep: () => void;
  confirmedCount: number;
  tagRuleDialog: TagRuleDialogState | null;
  setTagRuleDialogOpen: (open: boolean) => void;
  handleOpenTagRuleDialog: (group: ConfirmedGroup) => void;
  handleOpenTagRuleDialogForTransaction: (
    transaction: ConfirmedTransaction,
    tags: string[]
  ) => void;
  previewTransactions: Array<{ checksum: string; description: string; entityId: string | null }>;
  handleTagRuleApplied: (changeSet: TagRuleChangeSet, affected: TagRuleImpactItem[]) => void;
}

interface LocalTagsState {
  localTags: Record<string, string[]>;
  setLocalTags: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  suggestedTagMeta: Record<string, SuggestedTag[]>;
  setSuggestedTagMeta: React.Dispatch<React.SetStateAction<Record<string, SuggestedTag[]>>>;
  editedChecksumsRef: React.MutableRefObject<Set<string>>;
}

function useLocalTagsSync(confirmedTransactions: ConfirmedTransaction[]): LocalTagsState {
  const [localTags, setLocalTags] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(confirmedTransactions.map((t) => [t.checksum, t.tags ?? []]))
  );
  const editedChecksumsRef = useRef<Set<string>>(new Set());
  const [suggestedTagMeta, setSuggestedTagMeta] = useState<Record<string, SuggestedTag[]>>(() =>
    Object.fromEntries(confirmedTransactions.map((t) => [t.checksum, t.suggestedTags ?? []]))
  );

  useEffect(() => {
    editedChecksumsRef.current = new Set();
    setLocalTags((prev) => {
      const next = { ...prev };
      for (const t of confirmedTransactions) next[t.checksum] ??= t.tags ?? [];
      const keys = new Set(confirmedTransactions.map((t) => t.checksum));
      for (const k of Object.keys(next)) if (!keys.has(k)) delete next[k];
      return next;
    });
    setSuggestedTagMeta(
      Object.fromEntries(confirmedTransactions.map((t) => [t.checksum, t.suggestedTags ?? []]))
    );
  }, [confirmedTransactions]);

  return { localTags, setLocalTags, suggestedTagMeta, setSuggestedTagMeta, editedChecksumsRef };
}

function useAvailableTags(localTags: Record<string, string[]>): string[] {
  const { data: serverTags } = trpc.finance.transactions.availableTags.useQuery();
  return useMemo(() => {
    const local = Object.values(localTags).flat();
    return [...new Set([...(serverTags ?? []), ...local])].toSorted();
  }, [serverTags, localTags]);
}

function useTagRuleHandler(args: {
  addPendingTagRuleChangeSet: ImportStoreType['addPendingTagRuleChangeSet'];
  dialogGroupNameRef: React.MutableRefObject<string | null>;
  setLocalTags: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  setSuggestedTagMeta: React.Dispatch<React.SetStateAction<Record<string, SuggestedTag[]>>>;
  editedChecksumsRef: React.MutableRefObject<Set<string>>;
}) {
  const {
    addPendingTagRuleChangeSet,
    dialogGroupNameRef,
    setLocalTags,
    setSuggestedTagMeta,
    editedChecksumsRef,
  } = args;
  return useCallback(
    (changeSet: TagRuleChangeSet, affected: TagRuleImpactItem[]) => {
      addPendingTagRuleChangeSet({
        changeSet,
        source: `tag-review:${dialogGroupNameRef.current ?? 'unknown'}`,
      });
      if (affected.length === 0) return;
      setLocalTags((prev) => applyAffectedToLocalTags(prev, affected, editedChecksumsRef.current));
      setSuggestedTagMeta((prev) => applyAffectedToSuggested(prev, affected));
    },
    [
      addPendingTagRuleChangeSet,
      dialogGroupNameRef,
      setLocalTags,
      setSuggestedTagMeta,
      editedChecksumsRef,
    ]
  );
}

export function useTagReviewState(): UseTagReviewStateOutput {
  const store = useImportStore();
  const {
    confirmedTransactions,
    updateTransactionTags,
    nextStep,
    prevStep,
    addPendingTagRuleChangeSet,
  } = store;

  const { localTags, setLocalTags, suggestedTagMeta, setSuggestedTagMeta, editedChecksumsRef } =
    useLocalTagsSync(confirmedTransactions);

  const groups = useMemo(() => groupByEntity(confirmedTransactions), [confirmedTransactions]);
  const availableTags = useAvailableTags(localTags);

  const { updateTag, handleAcceptAll, handleApplyGroupTags } = useTagActions({
    setLocalTags,
    editedChecksumsRef,
    confirmedTransactions,
  });

  const handleContinue = useCallback(() => {
    for (const [checksum, tags] of Object.entries(localTags)) updateTransactionTags(checksum, tags);
    nextStep();
  }, [localTags, updateTransactionTags, nextStep]);

  const dialog = useTagRuleDialog(localTags);
  const handleTagRuleApplied = useTagRuleHandler({
    addPendingTagRuleChangeSet,
    dialogGroupNameRef: dialog.dialogGroupNameRef,
    setLocalTags,
    setSuggestedTagMeta,
    editedChecksumsRef,
  });

  const previewTransactions = useMemo(
    () =>
      confirmedTransactions.map((t) => ({
        checksum: t.checksum,
        description: t.description,
        entityId: t.entityId ?? null,
      })),
    [confirmedTransactions]
  );

  return {
    confirmedTransactions,
    groups,
    availableTags,
    localTags,
    suggestedTagMeta,
    updateTag,
    handleAcceptAll,
    handleApplyGroupTags,
    handleContinue,
    prevStep,
    confirmedCount: confirmedTransactions.length,
    tagRuleDialog: dialog.tagRuleDialog,
    setTagRuleDialogOpen: dialog.setTagRuleDialogOpen,
    handleOpenTagRuleDialog: dialog.handleOpenTagRuleDialog,
    handleOpenTagRuleDialogForTransaction: dialog.handleOpenTagRuleDialogForTransaction,
    previewTransactions,
    handleTagRuleApplied,
  };
}
