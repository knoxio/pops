import { useCallback } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import {
  collectNewTagNames,
  parseTags,
  type ProposeOutput,
  type RejectOutput,
  type TagRuleProposalDialogProps,
} from './types';

interface FormStateForMutations {
  pattern: string;
  matchType: 'exact' | 'contains' | 'regex';
  tagsText: string;
  rejectFeedback: string;
  acceptedNewTags: Set<string>;
  setFollowUpProposal: React.Dispatch<React.SetStateAction<ProposeOutput | null>>;
  setRejectOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setRejectFeedback: React.Dispatch<React.SetStateAction<string>>;
}

interface MutationsArgs {
  props: TagRuleProposalDialogProps;
  form: FormStateForMutations;
  proposal: ProposeOutput | undefined;
}

function buildRejectInput(
  proposal: ProposeOutput,
  props: TagRuleProposalDialogProps,
  form: FormStateForMutations,
  feedback: string
) {
  if (!props.signal) return null;
  return {
    changeSet: proposal.changeSet,
    feedback,
    signal: {
      descriptionPattern: form.pattern.trim() || props.signal.descriptionPattern,
      matchType: form.matchType,
      entityId: props.signal.entityId,
      tags: parseTags(form.tagsText.trim() ? form.tagsText : props.signal.tags.join(', ')),
    },
    transactions: props.previewTransactions.map((t) => ({
      transactionId: t.checksum,
      description: t.description,
      entityId: t.entityId ?? null,
    })),
    maxPreviewItems: 200,
  };
}

export function useTagRuleMutations(args: MutationsArgs) {
  const { props, form, proposal } = args;
  const utils = trpc.useUtils();
  const applyMutation = trpc.core.tagRules.applyTagRuleChangeSet.useMutation({
    onError: (e) => toast.error(e.message),
  });
  const rejectMutation = trpc.core.tagRules.rejectTagRuleChangeSet.useMutation({
    onSuccess: (data: RejectOutput) => {
      if (data.followUpProposal) {
        form.setFollowUpProposal(data.followUpProposal);
        form.setRejectOpen(false);
        form.setRejectFeedback('');
        toast.message('Proposal revised based on your feedback');
      } else {
        toast.message('Proposal dismissed');
        props.onOpenChange(false);
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const handleApply = useCallback(async () => {
    if (!proposal) return;
    const changeSet = proposal.changeSet;
    await applyMutation.mutateAsync({ changeSet, acceptedNewTags: [...form.acceptedNewTags] });
    await utils.core.tagRules.listVocabulary.invalidate();
    toast.success('Tag rule saved');
    props.onApplied?.(changeSet, proposal.preview.affected);
    props.onOpenChange(false);
  }, [proposal, applyMutation, form.acceptedNewTags, utils, props]);

  const handleReject = useCallback(() => {
    if (!proposal) return;
    const fb = form.rejectFeedback.trim();
    if (fb.length === 0) {
      toast.error('Please add a short note explaining why you are rejecting this proposal.');
      return;
    }
    const input = buildRejectInput(proposal, props, form, fb);
    if (input) rejectMutation.mutate(input);
  }, [proposal, props, rejectMutation, form]);

  return { applyMutation, rejectMutation, handleApply, handleReject };
}

export { collectNewTagNames };
