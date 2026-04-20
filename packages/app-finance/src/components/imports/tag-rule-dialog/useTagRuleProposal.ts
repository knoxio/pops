import { useEffect, useMemo, useState } from 'react';

import { trpc } from '@pops/api-client';

import {
  collectNewTagNames,
  parseTags,
  type ProposeOutput,
  type TagRuleProposalDialogProps,
} from './types';
import { useTagRuleMutations } from './useTagRuleMutations';

const DISABLED_INPUT = {
  signal: {
    descriptionPattern: '_',
    matchType: 'exact' as const,
    entityId: null as string | null,
    tags: ['_'],
  },
  transactions: [] as Array<{
    transactionId: string;
    description: string;
    entityId: string | null;
  }>,
  maxPreviewItems: 200,
};

interface FormState {
  pattern: string;
  setPattern: React.Dispatch<React.SetStateAction<string>>;
  matchType: 'exact' | 'contains' | 'regex';
  setMatchType: React.Dispatch<React.SetStateAction<'exact' | 'contains' | 'regex'>>;
  tagsText: string;
  setTagsText: React.Dispatch<React.SetStateAction<string>>;
  rejectOpen: boolean;
  setRejectOpen: React.Dispatch<React.SetStateAction<boolean>>;
  rejectFeedback: string;
  setRejectFeedback: React.Dispatch<React.SetStateAction<string>>;
  acceptedNewTags: Set<string>;
  setAcceptedNewTags: React.Dispatch<React.SetStateAction<Set<string>>>;
  followUpProposal: ProposeOutput | null;
  setFollowUpProposal: React.Dispatch<React.SetStateAction<ProposeOutput | null>>;
}

function useFormState(): FormState {
  const [pattern, setPattern] = useState('');
  const [matchType, setMatchType] = useState<'exact' | 'contains' | 'regex'>('contains');
  const [tagsText, setTagsText] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectFeedback, setRejectFeedback] = useState('');
  const [acceptedNewTags, setAcceptedNewTags] = useState<Set<string>>(new Set());
  const [followUpProposal, setFollowUpProposal] = useState<ProposeOutput | null>(null);
  return {
    pattern,
    setPattern,
    matchType,
    setMatchType,
    tagsText,
    setTagsText,
    rejectOpen,
    setRejectOpen,
    rejectFeedback,
    setRejectFeedback,
    acceptedNewTags,
    setAcceptedNewTags,
    followUpProposal,
    setFollowUpProposal,
  };
}

interface ProposeInputArgs {
  signal: TagRuleProposalDialogProps['signal'];
  previewTransactions: TagRuleProposalDialogProps['previewTransactions'];
  pattern: string;
  matchType: 'exact' | 'contains' | 'regex';
  tagsText: string;
}

function buildProposeInput(args: ProposeInputArgs) {
  const { signal, previewTransactions, pattern, matchType, tagsText } = args;
  if (!signal) return null;
  const tags = parseTags(tagsText.trim() ? tagsText : signal.tags.join(', '));
  if (tags.length === 0) return null;
  const descriptionPattern = pattern.trim() || signal.descriptionPattern;
  if (!descriptionPattern) return null;
  return {
    signal: { descriptionPattern, matchType, entityId: signal.entityId, tags },
    transactions: previewTransactions.map((t) => ({
      transactionId: t.checksum,
      description: t.description,
      entityId: t.entityId ?? null,
    })),
    maxPreviewItems: 200,
  };
}

function useResetOnOpen(props: TagRuleProposalDialogProps, form: FormState) {
  useEffect(() => {
    if (!props.open || !props.signal) return;
    form.setPattern(props.signal.descriptionPattern);
    form.setMatchType(props.signal.matchType);
    form.setTagsText(props.signal.tags.join(', '));
    form.setRejectOpen(false);
    form.setRejectFeedback('');
    form.setAcceptedNewTags(new Set());
    form.setFollowUpProposal(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, props.signal]);
}

function useSyncAcceptedTags(
  proposal: ProposeOutput | undefined,
  setAcceptedNewTags: FormState['setAcceptedNewTags']
) {
  useEffect(() => {
    if (!proposal) return;
    setAcceptedNewTags(new Set(collectNewTagNames(proposal)));
  }, [proposal, setAcceptedNewTags]);
}

export function useTagRuleProposal(props: TagRuleProposalDialogProps) {
  const form = useFormState();
  const proposeInput = useMemo(
    () =>
      buildProposeInput({
        signal: props.signal,
        previewTransactions: props.previewTransactions,
        pattern: form.pattern,
        matchType: form.matchType,
        tagsText: form.tagsText,
      }),
    [props.signal, props.previewTransactions, form.pattern, form.matchType, form.tagsText]
  );
  const proposeQuery = trpc.core.tagRules.proposeTagRuleChangeSet.useQuery(
    proposeInput ?? DISABLED_INPUT,
    { enabled: Boolean(props.open && proposeInput), staleTime: 0, retry: false }
  );
  const proposal: ProposeOutput | undefined = form.followUpProposal ?? proposeQuery.data;
  useResetOnOpen(props, form);
  useSyncAcceptedTags(proposal, form.setAcceptedNewTags);
  const newTagNames = useMemo(() => collectNewTagNames(proposal), [proposal]);
  const mutations = useTagRuleMutations({ props, form, proposal });
  const busy = mutations.applyMutation.isPending || mutations.rejectMutation.isPending;
  return { form, proposal, proposeQuery, newTagNames, busy, ...mutations };
}
