import type { TagRuleChangeSet } from '@pops/api/modules/core/tag-rules/types';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@pops/ui';
import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '../../lib/trpc';
import { useImportStore } from '../../store/importStore';

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
  previewTransactions: Array<{
    transactionId: string;
    description: string;
    entityId?: string | null;
  }>;
}

/** Stable comparison for v1 single-`add` proposals (avoids JSON key-order drift). */
function firstAddOpFingerprint(cs: TagRuleChangeSet): string | null {
  if (cs.ops.length === 0) return null;
  const first = cs.ops[0];
  if (!first || first.op !== 'add') {
    return `non-add|${cs.ops.length}|${cs.ops.map((o) => o.op).join(',')}`;
  }
  const d = first.data;
  const tags = [...(d.tags ?? [])]
    .map((t) => t.trim())
    .filter(Boolean)
    .sort();
  return [cs.ops.length, d.descriptionPattern, d.matchType, d.entityId ?? '', tags.join('\0')].join(
    '|'
  );
}

function patchFirstAddOp(
  changeSet: TagRuleChangeSet,
  patch: Partial<{
    descriptionPattern: string;
    matchType: 'exact' | 'contains' | 'regex';
    entityId: string | null;
    tags: string[];
  }>
): TagRuleChangeSet {
  const first = changeSet.ops[0];
  if (!first || first.op !== 'add') return changeSet;
  return {
    ...changeSet,
    ops: [{ ...first, data: { ...first.data, ...patch } }, ...changeSet.ops.slice(1)],
  };
}

export function TagRuleProposalDialog(props: TagRuleProposalDialogProps) {
  const addPendingTagRuleChangeSet = useImportStore((s) => s.addPendingTagRuleChangeSet);

  const disabledSignal = useMemo(
    () => ({
      descriptionPattern: '_',
      matchType: 'contains' as const,
      entityId: null as string | null,
      tags: ['_'],
    }),
    []
  );

  const proposeInput = useMemo(() => {
    if (!props.signal) return null;
    return {
      signal: {
        descriptionPattern: props.signal.descriptionPattern,
        matchType: props.signal.matchType,
        entityId: props.signal.entityId,
        tags: props.signal.tags,
      },
      transactions: props.previewTransactions.map((t) => ({
        transactionId: t.transactionId,
        description: t.description,
        entityId: t.entityId ?? null,
      })),
      maxPreviewItems: 200,
    };
  }, [props.signal, props.previewTransactions]);

  const proposeQuery = trpc.core.tagRules.proposeTagRuleChangeSet.useQuery(
    proposeInput ?? {
      signal: disabledSignal,
      transactions: [],
      maxPreviewItems: 200,
    },
    {
      enabled: Boolean(props.open && proposeInput),
      staleTime: 0,
      retry: false,
    }
  );

  const [draft, setDraft] = useState<TagRuleChangeSet | null>(null);
  const [tagsText, setTagsText] = useState('');
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectFeedback, setRejectFeedback] = useState('');

  useEffect(() => {
    if (!props.open) {
      setDraft(null);
      setTagsText('');
      setRejectMode(false);
      setRejectFeedback('');
      return;
    }
    const data = proposeQuery.data;
    if (!data) return;
    setDraft(data.changeSet);
    const first = data.changeSet.ops[0];
    if (first && first.op === 'add') {
      setTagsText(first.data.tags.join(', '));
    }
  }, [props.open, proposeQuery.data]);

  const previewInput = useMemo(() => {
    if (!props.open || !draft) return null;
    return {
      changeSet: draft,
      transactions: props.previewTransactions.map((t) => ({
        transactionId: t.transactionId,
        description: t.description,
        entityId: t.entityId ?? null,
      })),
      maxPreviewItems: 200,
    };
  }, [props.open, draft, props.previewTransactions]);

  const previewQuery = trpc.core.tagRules.previewTagRuleChangeSet.useQuery(
    previewInput ?? {
      changeSet: { ops: [{ op: 'add' as const, data: { descriptionPattern: '_', tags: ['_'] } }] },
      transactions: [],
      maxPreviewItems: 200,
    },
    {
      enabled: Boolean(previewInput),
      staleTime: 0,
      retry: false,
    }
  );

  const rejectMutation = trpc.core.tagRules.rejectTagRuleChangeSet.useMutation({
    onSuccess: () => {
      toast.success('Proposal rejected — feedback recorded');
      props.onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const baseline = proposeQuery.data?.changeSet;
  const hasStructuralEdits = useMemo(() => {
    if (!draft || !baseline) return false;
    const a = firstAddOpFingerprint(draft);
    const b = firstAddOpFingerprint(baseline);
    if (!a || !b) return true;
    return a !== b;
  }, [draft, baseline]);

  const isBusy = proposeQuery.isFetching || previewQuery.isFetching || rejectMutation.isPending;

  const canApply =
    !isBusy &&
    Boolean(draft) &&
    !proposeQuery.isError &&
    !previewQuery.isError &&
    !previewQuery.isFetching &&
    draft !== null;

  const handlePatternChange = useCallback((value: string) => {
    setDraft((prev) => (prev ? patchFirstAddOp(prev, { descriptionPattern: value }) : prev));
  }, []);

  const handleMatchTypeChange = useCallback((value: 'exact' | 'contains' | 'regex') => {
    setDraft((prev) => (prev ? patchFirstAddOp(prev, { matchType: value }) : prev));
  }, []);

  const handleTagsBlur = useCallback(() => {
    const tags = tagsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (tags.length === 0) return;
    setDraft((prev) => (prev ? patchFirstAddOp(prev, { tags }) : prev));
  }, [tagsText]);

  const handleApprove = useCallback(() => {
    if (!draft) return;
    const tags = tagsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (tags.length === 0) {
      toast.error('Add at least one tag before saving this rule.');
      return;
    }
    const finalDraft = patchFirstAddOp(draft, { tags });
    try {
      addPendingTagRuleChangeSet({ changeSet: finalDraft, source: 'tag-rule-proposal' });
      toast.success('Tag rule saved locally — it will apply when you commit the import');
      props.onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save tag rule');
    }
  }, [addPendingTagRuleChangeSet, draft, props, tagsText]);

  const handleConfirmReject = useCallback(() => {
    if (!draft) return;
    const trimmed = rejectFeedback.trim();
    if (!trimmed) return;
    rejectMutation.mutate({ changeSet: draft, feedback: trimmed });
  }, [draft, rejectFeedback, rejectMutation]);

  const firstAdd = draft?.ops[0]?.op === 'add' ? draft.ops[0].data : null;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Save tag rule</DialogTitle>
          <DialogDescription>
            Preview how a new tag rule would affect this import batch, then approve it into your
            pending changes (same flow as classification rules).
          </DialogDescription>
        </DialogHeader>

        {proposeQuery.isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="h-4 w-4 animate-spin" />
            Building proposal…
          </div>
        )}

        {proposeQuery.isError && (
          <p className="text-sm text-destructive">{proposeQuery.error.message}</p>
        )}

        {draft && firstAdd && !proposeQuery.isLoading && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tag-rule-pattern">Description pattern</Label>
              <Input
                id="tag-rule-pattern"
                value={firstAdd.descriptionPattern}
                onChange={(e) => handlePatternChange(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tag-rule-match">Match type</Label>
              <select
                id="tag-rule-match"
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={firstAdd.matchType}
                onChange={(e) =>
                  handleMatchTypeChange(e.target.value as 'exact' | 'contains' | 'regex')
                }
              >
                <option value="contains">Contains</option>
                <option value="exact">Exact</option>
                <option value="regex">Regex</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tag-rule-tags">Tags (comma-separated)</Label>
              <Input
                id="tag-rule-tags"
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                onBlur={handleTagsBlur}
              />
            </div>

            {proposeQuery.data?.rationale && (
              <p className="text-xs text-muted-foreground">{proposeQuery.data.rationale}</p>
            )}

            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Impact preview</p>
                {previewQuery.isFetching && <Loader2 className="h-4 w-4 animate-spin" />}
              </div>
              {previewQuery.isError && (
                <p className="text-xs text-destructive">{previewQuery.error.message}</p>
              )}
              {previewQuery.data && (
                <>
                  <p className="text-xs text-muted-foreground">
                    {previewQuery.data.counts.affected} transaction
                    {previewQuery.data.counts.affected === 1 ? '' : 's'} would receive new tag
                    suggestions from this rule in this batch.
                  </p>
                  {previewQuery.data.counts.newTagProposals > 0 && (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Includes {previewQuery.data.counts.newTagProposals} new vocabulary tag
                      proposal{previewQuery.data.counts.newTagProposals === 1 ? '' : 's'}.
                    </p>
                  )}
                  <ul className="max-h-40 overflow-y-auto space-y-1 text-xs">
                    {previewQuery.data.affected.slice(0, 50).map((row) => (
                      <li key={row.transactionId} className="truncate">
                        <span className="font-mono text-muted-foreground">
                          {row.transactionId.slice(0, 10)}…
                        </span>{' '}
                        <span className="text-foreground">{row.description}</span>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {row.after.suggestedTags.map((s) => (
                            <Badge key={`${row.transactionId}-${s.tag}`} variant="secondary">
                              {s.tag}
                              {s.isNew ? ' (new)' : ''}
                            </Badge>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            {hasStructuralEdits && (
              <p className="text-xs text-muted-foreground">
                You edited the proposed rule. Review the impact preview above, then reset to the
                server proposal or keep your edits in sync (preview updates automatically).
              </p>
            )}
          </div>
        )}

        {rejectMode && draft && (
          <div className="space-y-2">
            <Label htmlFor="tag-rule-reject-feedback">Feedback</Label>
            <textarea
              id="tag-rule-reject-feedback"
              className="w-full min-h-[88px] rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={rejectFeedback}
              onChange={(e) => setRejectFeedback(e.target.value)}
              placeholder="Why should this rule not be learned?"
            />
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {!rejectMode ? (
            <>
              <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" variant="ghost" onClick={() => setRejectMode(true)}>
                Reject…
              </Button>
              <Button type="button" onClick={handleApprove} disabled={!canApply}>
                Approve (save locally)
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => setRejectMode(false)}>
                Back
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleConfirmReject}
                disabled={!rejectFeedback.trim() || !draft}
              >
                Confirm reject
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
