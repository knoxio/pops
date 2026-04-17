import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
} from '@pops/ui';

import { trpc } from '../../lib/trpc';

import type { inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@pops/api-client';

type ProposeOutput = inferRouterOutputs<AppRouter>['core']['tagRules']['proposeTagRuleChangeSet'];

export interface TagRuleLearnSignal {
  descriptionPattern: string;
  matchType: 'exact' | 'contains' | 'regex';
  entityId: string | null;
  tags: string[];
}

export interface TagRuleProposalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  signal: TagRuleLearnSignal | null;
  /** All import rows to evaluate for impact preview (checksum = transactionId). */
  previewTransactions: Array<{
    checksum: string;
    description: string;
    entityId?: string | null;
  }>;
  onApplied?: () => void;
}

export function TagRuleProposalDialog(props: TagRuleProposalDialogProps) {
  const utils = trpc.useUtils();
  const [pattern, setPattern] = useState('');
  const [matchType, setMatchType] = useState<'exact' | 'contains' | 'regex'>('contains');
  const [tagsText, setTagsText] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectFeedback, setRejectFeedback] = useState('');
  const [acceptedNewTags, setAcceptedNewTags] = useState<Set<string>>(new Set());

  const proposeInput = useMemo(() => {
    if (!props.signal) return null;
    const tags = parseTags(tagsText.trim() ? tagsText : props.signal.tags.join(', '));
    if (tags.length === 0) return null;
    const descriptionPattern = pattern.trim() || props.signal.descriptionPattern;
    if (!descriptionPattern) return null;
    return {
      signal: {
        descriptionPattern,
        matchType,
        entityId: props.signal.entityId,
        tags,
      },
      transactions: props.previewTransactions.map((t) => ({
        transactionId: t.checksum,
        description: t.description,
        entityId: t.entityId ?? null,
      })),
      maxPreviewItems: 200,
    };
  }, [props.signal, props.previewTransactions, pattern, matchType, tagsText]);

  const disabledInput = {
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

  const proposeQuery = trpc.core.tagRules.proposeTagRuleChangeSet.useQuery(
    proposeInput ?? disabledInput,
    {
      enabled: Boolean(props.open && proposeInput),
      staleTime: 0,
      retry: false,
    }
  );

  const proposal: ProposeOutput | undefined = proposeQuery.data;

  useEffect(() => {
    if (!props.open || !props.signal) return;
    setPattern(props.signal.descriptionPattern);
    setMatchType(props.signal.matchType);
    setTagsText(props.signal.tags.join(', '));
    setRejectOpen(false);
    setRejectFeedback('');
    setAcceptedNewTags(new Set());
  }, [props.open, props.signal]);

  const newTagNames = useMemo(() => {
    const names = new Set<string>();
    for (const row of proposal?.preview.affected ?? []) {
      for (const s of row.after.suggestedTags) {
        if (s.isNew) names.add(s.tag);
      }
    }
    return [...names].toSorted((a, b) => a.localeCompare(b));
  }, [proposal]);

  useEffect(() => {
    if (!proposal) return;
    const names = new Set<string>();
    for (const row of proposal.preview.affected) {
      for (const s of row.after.suggestedTags) {
        if (s.isNew) names.add(s.tag);
      }
    }
    setAcceptedNewTags(names);
  }, [proposal]);

  const applyMutation = trpc.core.tagRules.applyTagRuleChangeSet.useMutation({
    onSuccess: async () => {
      await utils.core.tagRules.listVocabulary.invalidate();
      toast.success('Tag rule saved');
      props.onApplied?.();
      props.onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const rejectMutation = trpc.core.tagRules.rejectTagRuleChangeSet.useMutation({
    onSuccess: () => {
      toast.message('Proposal dismissed');
      props.onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleApply = useCallback(() => {
    if (!proposal) return;
    applyMutation.mutate({
      changeSet: proposal.changeSet,
      acceptedNewTags: [...acceptedNewTags],
    });
  }, [proposal, applyMutation, acceptedNewTags]);

  const handleReject = useCallback(() => {
    if (!proposal) return;
    const fb = rejectFeedback.trim();
    if (fb.length === 0) {
      toast.error('Please add a short note explaining why you are rejecting this proposal.');
      return;
    }
    rejectMutation.mutate({ changeSet: proposal.changeSet, feedback: fb });
  }, [proposal, rejectMutation, rejectFeedback]);

  const busy = applyMutation.isPending || rejectMutation.isPending;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Save tag rule</DialogTitle>
          <DialogDescription>
            Create a reusable tag rule from this group. Rules apply as <strong>suggestions</strong>{' '}
            on future imports and never overwrite tags you set manually.
          </DialogDescription>
        </DialogHeader>

        {!props.signal ? null : (
          <div className="space-y-4 text-sm">
            <div className="space-y-2">
              <Label htmlFor="tr-pattern">Description pattern</Label>
              <Input
                id="tr-pattern"
                value={pattern}
                onChange={(e) => {
                  setPattern(e.target.value);
                }}
                placeholder="e.g. WOOLWORTHS"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tr-match">Match type</Label>
              <select
                id="tr-match"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                value={matchType}
                onChange={(e) => {
                  setMatchType(e.target.value as 'exact' | 'contains' | 'regex');
                }}
              >
                <option value="contains">Contains</option>
                <option value="exact">Exact</option>
                <option value="regex">Regex</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tr-tags">Tags (comma-separated)</Label>
              <Input
                id="tr-tags"
                value={tagsText}
                onChange={(e) => {
                  setTagsText(e.target.value);
                }}
                placeholder="Groceries, Transport"
              />
            </div>

            {proposeQuery.isLoading && <p className="text-muted-foreground">Generating preview…</p>}
            {proposeQuery.isError && (
              <p className="text-destructive text-xs">{proposeQuery.error.message}</p>
            )}

            {proposal && (
              <>
                <p className="text-muted-foreground text-xs">{proposal.rationale}</p>
                <div className="rounded-md border p-3 space-y-1">
                  <p className="font-medium text-xs">Impact preview</p>
                  <p className="text-xs text-muted-foreground">
                    {proposal.preview.counts.affected} matching row
                    {proposal.preview.counts.affected === 1 ? '' : 's'} in this import would receive
                    tag suggestions (simulated without per-row tag locks).
                  </p>
                  <ul className="text-xs max-h-28 overflow-y-auto space-y-0.5 font-mono">
                    {proposal.preview.affected.slice(0, 12).map((a) => (
                      <li key={a.transactionId} className="truncate" title={a.description}>
                        {a.description.slice(0, 56)}
                        {a.description.length > 56 ? '…' : ''}
                      </li>
                    ))}
                  </ul>
                  {proposal.preview.affected.length > 12 && (
                    <p className="text-xs text-muted-foreground">
                      +{proposal.preview.affected.length - 12} more
                    </p>
                  )}
                </div>

                {newTagNames.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium">
                      New vocabulary tags — accept before saving
                    </p>
                    <div className="space-y-2">
                      {newTagNames.map((tag) => (
                        <label key={tag} className="flex items-center gap-2 text-xs">
                          <Checkbox
                            checked={acceptedNewTags.has(tag)}
                            onCheckedChange={(v) => {
                              setAcceptedNewTags((prev) => {
                                const next = new Set(prev);
                                if (v === true) next.add(tag);
                                else next.delete(tag);
                                return next;
                              });
                            }}
                          />
                          <span>{tag}</span>
                          <span className="text-muted-foreground">(new)</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {rejectOpen && (
              <div className="space-y-2">
                <Label htmlFor="tr-reject">Feedback (required)</Label>
                <Textarea
                  id="tr-reject"
                  value={rejectFeedback}
                  onChange={(e) => {
                    setRejectFeedback(e.target.value);
                  }}
                  rows={3}
                  placeholder="What should change about this rule?"
                />
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              props.onOpenChange(false);
            }}
            disabled={busy}
          >
            Cancel
          </Button>
          {!rejectOpen ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setRejectOpen(true);
              }}
              disabled={busy || !proposal}
            >
              Reject…
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={handleReject}
              disabled={busy}
            >
              Confirm reject
            </Button>
          )}
          <Button type="button" onClick={handleApply} disabled={busy || !proposal}>
            {busy ? 'Saving…' : 'Save rule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function parseTags(raw: string): string[] {
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}
