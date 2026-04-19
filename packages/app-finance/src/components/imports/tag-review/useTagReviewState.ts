import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import { useImportStore } from '../../../store/importStore';
import { groupByEntity, unionTags } from './tagReviewUtils';

import type { TagRuleChangeSet, TagRuleImpactItem } from '@pops/api/modules/core/tag-rules/types';
import type { ConfirmedTransaction, SuggestedTag } from '@pops/api/modules/finance/imports';

import type { TagRuleLearnSignal } from '../TagRuleProposalDialog';
import type { ConfirmedGroup } from './tagReviewUtils';

interface TagRuleDialogState {
  signal: TagRuleLearnSignal;
  groupEntityName: string;
}

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

export function useTagReviewState(): UseTagReviewStateOutput {
  const {
    confirmedTransactions,
    updateTransactionTags,
    nextStep,
    prevStep,
    addPendingTagRuleChangeSet,
  } = useImportStore();

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
      for (const t of confirmedTransactions) {
        next[t.checksum] ??= t.tags ?? [];
      }
      const keys = new Set(confirmedTransactions.map((t) => t.checksum));
      for (const k of Object.keys(next)) {
        if (!keys.has(k)) delete next[k];
      }
      return next;
    });
    setSuggestedTagMeta(
      Object.fromEntries(confirmedTransactions.map((t) => [t.checksum, t.suggestedTags ?? []]))
    );
  }, [confirmedTransactions]);

  const groups = useMemo(() => groupByEntity(confirmedTransactions), [confirmedTransactions]);

  const { data: serverTags } = trpc.finance.transactions.availableTags.useQuery();
  const availableTags = useMemo(() => {
    const local = Object.values(localTags).flat();
    return [...new Set([...(serverTags ?? []), ...local])].toSorted();
  }, [serverTags, localTags]);

  const updateTag = useCallback((checksum: string, tags: string[]) => {
    setLocalTags((prev) => ({ ...prev, [checksum]: tags }));
    editedChecksumsRef.current.add(checksum);
  }, []);

  const handleAcceptAll = useCallback(() => {
    const updated: Record<string, string[]> = {};
    for (const t of confirmedTransactions) {
      updated[t.checksum] = t.tags ?? [];
    }
    setLocalTags(updated);
    toast.success('All suggested tags accepted');
  }, [confirmedTransactions]);

  const handleApplyGroupTags = useCallback((group: ConfirmedGroup, newTags: string[]) => {
    setLocalTags((prev) => {
      const next = { ...prev };
      for (const t of group.transactions) {
        const existing = prev[t.checksum] ?? [];
        next[t.checksum] = Array.from(new Set([...existing, ...newTags]));
      }
      return next;
    });
  }, []);

  const handleContinue = useCallback(() => {
    for (const [checksum, tags] of Object.entries(localTags)) {
      updateTransactionTags(checksum, tags);
    }
    nextStep();
  }, [localTags, updateTransactionTags, nextStep]);

  const [tagRuleDialog, setTagRuleDialog] = useState<TagRuleDialogState | null>(null);

  const handleOpenTagRuleDialog = useCallback(
    (group: ConfirmedGroup) => {
      const groupTags = unionTags(group.transactions.map((t) => localTags[t.checksum] ?? []));
      if (groupTags.length === 0) {
        toast.info('Add at least one tag to this group before saving a rule.');
        return;
      }
      const entityId = group.transactions[0]?.entityId ?? null;
      const signal: TagRuleLearnSignal = {
        descriptionPattern: group.entityName,
        matchType: 'contains',
        entityId: entityId ?? null,
        tags: groupTags,
      };
      setTagRuleDialog({ signal, groupEntityName: group.entityName });
    },
    [localTags]
  );

  const handleOpenTagRuleDialogForTransaction = useCallback(
    (transaction: ConfirmedTransaction, tags: string[]) => {
      if (tags.length === 0) {
        toast.info('Add at least one tag to this transaction before saving a rule.');
        return;
      }
      const signal: TagRuleLearnSignal = {
        descriptionPattern: transaction.description,
        matchType: 'contains',
        entityId: transaction.entityId ?? null,
        tags,
      };
      setTagRuleDialog({ signal, groupEntityName: transaction.description });
    },
    []
  );

  const dialogGroupNameRef = useRef<string | null>(null);
  useEffect(() => {
    if (tagRuleDialog) {
      dialogGroupNameRef.current = tagRuleDialog.groupEntityName;
    }
  }, [tagRuleDialog]);

  const handleTagRuleApplied = useCallback(
    (changeSet: TagRuleChangeSet, affected: TagRuleImpactItem[]) => {
      addPendingTagRuleChangeSet({
        changeSet,
        source: `tag-review:${dialogGroupNameRef.current ?? 'unknown'}`,
      });

      if (affected.length === 0) return;

      setLocalTags((prev) => {
        const next = { ...prev };
        for (const item of affected) {
          const checksum = item.transactionId;
          if (!editedChecksumsRef.current.has(checksum)) {
            const newRuleTags = item.after.suggestedTags.map((s) => s.tag);
            const existingTags = prev[checksum] ?? [];
            next[checksum] = [...new Set([...existingTags, ...newRuleTags])];
          }
        }
        return next;
      });

      setSuggestedTagMeta((prev) => {
        const next = { ...prev };
        for (const item of affected) {
          const checksum = item.transactionId;
          const ruleSuggestedTags = item.after.suggestedTags.map((s) => ({
            tag: s.tag,
            source: (s.source === 'tag_rule' ? 'rule' : s.source) as SuggestedTag['source'],
            pattern: s.pattern,
          }));
          const ruleSuggestedTagSet = new Set(ruleSuggestedTags.map((s) => s.tag));
          const existingMeta = prev[checksum] ?? [];
          next[checksum] = [
            ...existingMeta.filter((entry) => !ruleSuggestedTagSet.has(entry.tag)),
            ...ruleSuggestedTags,
          ];
        }
        return next;
      });
    },
    [addPendingTagRuleChangeSet]
  );

  const previewTransactions = useMemo(
    () =>
      confirmedTransactions.map((t) => ({
        checksum: t.checksum,
        description: t.description,
        entityId: t.entityId ?? null,
      })),
    [confirmedTransactions]
  );

  const setTagRuleDialogOpen = useCallback((open: boolean) => {
    if (!open) setTagRuleDialog(null);
  }, []);

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
    tagRuleDialog,
    setTagRuleDialogOpen,
    handleOpenTagRuleDialog,
    handleOpenTagRuleDialogForTransaction,
    previewTransactions,
    handleTagRuleApplied,
  };
}
