import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { unionTags } from './tagReviewUtils';

import type { ConfirmedTransaction } from '@pops/api/modules/finance/imports';

import type { TagRuleLearnSignal } from '../TagRuleProposalDialog';
import type { ConfirmedGroup } from './tagReviewUtils';

export interface TagRuleDialogState {
  signal: TagRuleLearnSignal;
  groupEntityName: string;
}

export function useTagRuleDialog(localTags: Record<string, string[]>) {
  const [tagRuleDialog, setTagRuleDialog] = useState<TagRuleDialogState | null>(null);
  const dialogGroupNameRef = useRef<string | null>(null);

  useEffect(() => {
    if (tagRuleDialog) dialogGroupNameRef.current = tagRuleDialog.groupEntityName;
  }, [tagRuleDialog]);

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

  const setTagRuleDialogOpen = useCallback((open: boolean) => {
    if (!open) setTagRuleDialog(null);
  }, []);

  return {
    tagRuleDialog,
    dialogGroupNameRef,
    handleOpenTagRuleDialog,
    handleOpenTagRuleDialogForTransaction,
    setTagRuleDialogOpen,
  };
}
