import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { unwrap } from '../../../finance-api-helpers.js';
import {
  tagRulesApply,
  tagRulesReject,
  type TagRulesApplyData,
  type TagRulesRejectData,
} from '../../../finance-api/index.js';
import {
  collectNewTagNames,
  parseTags,
  type ProposeOutput,
  type RejectOutput,
  type TagRuleProposalDialogProps,
} from './types';

type ApplyBody = NonNullable<TagRulesApplyData['body']>;
type RejectBody = NonNullable<TagRulesRejectData['body']>;

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
): RejectBody | null {
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
  const queryClient = useQueryClient();
  const applyMutation = useMutation({
    mutationFn: async (vars: ApplyBody) => unwrap(await tagRulesApply({ body: vars })),
    onError: (e: Error) => toast.error(e.message),
  });
  const rejectMutation = useMutation({
    mutationFn: async (vars: RejectBody): Promise<RejectOutput> =>
      unwrap(await tagRulesReject({ body: vars })),
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
    onError: (e: Error) => toast.error(e.message),
  });

  const handleApply = useCallback(async () => {
    if (!proposal) return;
    const changeSet = proposal.changeSet;
    await applyMutation.mutateAsync({ changeSet, acceptedNewTags: [...form.acceptedNewTags] });
    await queryClient.invalidateQueries({ queryKey: ['finance', 'tagRules'] });
    await queryClient.invalidateQueries({ queryKey: ['finance', 'transactions', 'availableTags'] });
    toast.success('Tag rule saved');
    props.onApplied?.(changeSet, proposal.preview.affected);
    props.onOpenChange(false);
  }, [proposal, applyMutation, form.acceptedNewTags, queryClient, props]);

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
