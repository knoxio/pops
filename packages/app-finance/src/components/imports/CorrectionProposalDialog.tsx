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
} from '@pops/ui';
import { Plus, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { computeMergedRules } from '../../lib/merged-state';
import { trpc } from '../../lib/trpc';
import { useImportStore } from '../../store/importStore';
import {
  type CorrectionSignal,
  type LocalOp,
  type ServerChangeSet,
  type TriggeringTransactionContext,
} from './correction-proposal-shared';
import {
  AiHelperPanel,
  BrowseRuleDetailPanel,
  ContextPanel,
  DetailPanel,
  ImpactPanel,
  OpsListPanel,
  type PreviewView,
  RejectPanel,
} from './CorrectionProposalDialogPanels';
import { useApplyRejectMutations } from './hooks/useApplyRejectMutations';
import { localOpsToChangeSet, newClientId, useLocalOps } from './hooks/useLocalOps';
import { usePreviewEffects } from './hooks/usePreviewEffects';
import type { CorrectionRule } from './RulePicker';

// Re-export shared symbols so existing consumers don't break
export type {
  AddRuleData,
  CorrectionSignal,
  EditRuleData,
  LocalOp,
  OpKind,
  PreviewChangeSetOutput,
  TriggeringTransactionContext,
} from './correction-proposal-shared';
export {
  matchTypeLabel,
  normalizeForMatch,
  opKindBadgeVariant,
  opKindLabel,
  opSummary,
  PREVIEW_CHANGESET_MAX_TRANSACTIONS,
  scopePreviewTransactions,
  transactionMatchesSignal,
} from './correction-proposal-shared';

// Re-export hook helpers for tests
export { serverOpToLocalOp } from './hooks/useLocalOps';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CorrectionProposalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  signal: CorrectionSignal | null;
  triggeringTransaction: TriggeringTransactionContext | null;
  previewTransactions: Array<{ checksum?: string; description: string }>;
  minConfidence?: number;
  onApproved?: (changeSet: ServerChangeSet) => void;
  mode?: 'proposal' | 'browse';
  onBrowseClose?: (hadChanges: boolean) => void;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CorrectionProposalDialog(props: CorrectionProposalDialogProps) {
  const minConfidence = props.minConfidence ?? 0.7;
  const isBrowseMode = props.mode === 'browse';

  // ---- initial propose query ---------------------------------------------

  const disabledSignal: CorrectionSignal = useMemo(
    () => ({ descriptionPattern: '_', matchType: 'exact', tags: [] }),
    []
  );

  const proposeInput = useMemo(() => {
    if (!props.signal) return null;
    return { signal: props.signal, minConfidence, maxPreviewItems: 200 };
  }, [props.signal, minConfidence]);

  const proposeQuery = trpc.core.corrections.proposeChangeSet.useQuery(
    proposeInput ?? { signal: disabledSignal, minConfidence, maxPreviewItems: 200 },
    {
      enabled: Boolean(!isBrowseMode && props.open && proposeInput),
      staleTime: 0,
      retry: false,
    }
  );

  // ---- extracted hooks ---------------------------------------------------

  const localOpsHook = useLocalOps({
    open: props.open,
    signal: props.signal,
    isBrowseMode,
    proposeData: proposeQuery.data,
  });

  const {
    localOps,
    setLocalOps,
    selectedClientId,
    setSelectedClientId,
    selectedOp,
    rationale,
    setRationale,
    updateOp,
    handleDeleteOp,
    handleAddNewRuleOp,
    handleAddTargetedOp,
    seededForSignalRef,
  } = localOpsHook;

  const pendingChangeSets = useImportStore((s) => s.pendingChangeSets);

  const previewHook = usePreviewEffects(
    {
      open: props.open,
      localOps,
      selectedOp,
      minConfidence,
      previewTransactions: props.previewTransactions,
      pendingChangeSets,
    },
    setLocalOps
  );

  const {
    combinedPreview,
    combinedPreviewError,
    combinedPreviewTruncated,
    selectedOpPreview,
    selectedOpPreviewError,
    selectedOpPreviewTruncated,
    previewMutationPending,
    hasDirty,
    handleRerunPreview,
    resetPreviewState,
    lastCombinedStructuralSigRef,
    selectedOpPreviewKeyRef,
  } = previewHook;

  const handleCloseRef = useRef<() => void>(() => {});

  const mutationsHook = useApplyRejectMutations({
    signal: props.signal,
    sessionId: props.sessionId,
    localOps,
    combinedPreview,
    combinedPreviewError,
    previewTransactions: props.previewTransactions,
    isFetching: proposeQuery.isFetching,
    previewMutationPending,
    hasDirty,
    onApproved: props.onApproved,
    onClose: () => handleCloseRef.current(),
    setLocalOps,
    setSelectedClientId,
    setRationale,
    lastCombinedStructuralSigRef,
    selectedOpPreviewKeyRef,
  });

  const {
    rejectMode,
    setRejectMode,
    rejectFeedback,
    setRejectFeedback,
    aiInstruction,
    setAiInstruction,
    aiMessages,
    aiBusy,
    isBusy,
    canApply,
    handleApprove,
    handleConfirmReject,
    handleAiSubmit,
    resetMutationState,
  } = mutationsHook;

  // ---- preview view state ------------------------------------------------
  const [previewView, setPreviewView] = useState<PreviewView>('selected');

  // ---- browse mode state --------------------------------------------------
  const [browseSearch, setBrowseSearch] = useState('');
  const [browseSelectedRuleId, setBrowseSelectedRuleId] = useState<string | null>(null);
  const browseInitialPendingCountRef = useRef<number>(0);
  const addPendingChangeSet = useImportStore((s) => s.addPendingChangeSet);

  const browseListQuery = trpc.core.corrections.list.useQuery(
    { limit: 500, offset: 0 },
    { enabled: isBrowseMode && props.open, staleTime: 30_000 }
  );

  const browseDbRules = browseListQuery.data?.data ?? [];

  const browseMergedRules: CorrectionRule[] = useMemo(() => {
    if (!isBrowseMode) return [];
    if (pendingChangeSets.length === 0) return browseDbRules;
    return computeMergedRules(
      browseDbRules as unknown as Parameters<typeof computeMergedRules>[0],
      pendingChangeSets
    ) as unknown as CorrectionRule[];
  }, [isBrowseMode, browseDbRules, pendingChangeSets]);

  const browseFilteredRules = useMemo(() => {
    const needle = browseSearch.trim().toLowerCase();
    if (!needle) return browseMergedRules;
    return browseMergedRules.filter((r) => {
      const haystack =
        `${r.descriptionPattern} ${r.entityName ?? ''} ${r.matchType} ${r.location ?? ''}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [browseMergedRules, browseSearch]);

  const browseSelectedRule = useMemo(
    () => browseMergedRules.find((r) => r.id === browseSelectedRuleId) ?? null,
    [browseMergedRules, browseSelectedRuleId]
  );

  useEffect(() => {
    if (isBrowseMode && props.open) {
      browseInitialPendingCountRef.current = useImportStore.getState().pendingChangeSets.length;
    }
  }, [isBrowseMode, props.open]);

  // ---- handlers -----------------------------------------------------------

  function handleOpenChange(open: boolean) {
    if (!open && isBrowseMode) {
      const currentCount = useImportStore.getState().pendingChangeSets.length;
      const hadChanges = currentCount !== browseInitialPendingCountRef.current;
      setBrowseSearch('');
      setBrowseSelectedRuleId(null);
      setLocalOps([]);
      setSelectedClientId(null);
      props.onOpenChange(false);
      props.onBrowseClose?.(hadChanges);
      return;
    }
    props.onOpenChange(open);
    if (!open) {
      setLocalOps([]);
      setSelectedClientId(null);
      setPreviewView('selected');
      resetPreviewState();
      resetMutationState();
      setRationale(null);
      seededForSignalRef.current = null;
    }
  }

  handleCloseRef.current = () => handleOpenChange(false);

  const handleBrowseSelectRule = useCallback(
    (ruleId: string) => {
      setBrowseSelectedRuleId(ruleId);
      const existingOp = localOps.find((o) => o.kind !== 'add' && o.targetRuleId === ruleId);
      if (existingOp) {
        setSelectedClientId(existingOp.clientId);
      } else {
        setSelectedClientId(null);
      }
    },
    [localOps, setSelectedClientId]
  );

  const handleBrowseEditRule = useCallback(
    (rule: CorrectionRule) => {
      const newOp: LocalOp = {
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
      setLocalOps((prev) => [...prev, newOp]);
      setSelectedClientId(newOp.clientId);
    },
    [setLocalOps, setSelectedClientId]
  );

  const handleBrowseDisableRule = useCallback(
    (rule: CorrectionRule) => {
      const newOp: LocalOp = {
        kind: 'disable',
        clientId: newClientId('disable'),
        targetRuleId: rule.id,
        targetRule: rule,
        rationale: '',
        dirty: true,
      };
      setLocalOps((prev) => [...prev, newOp]);
      setSelectedClientId(newOp.clientId);
    },
    [setLocalOps, setSelectedClientId]
  );

  const handleBrowseRemoveRule = useCallback(
    (rule: CorrectionRule) => {
      const newOp: LocalOp = {
        kind: 'remove',
        clientId: newClientId('remove'),
        targetRuleId: rule.id,
        targetRule: rule,
        rationale: '',
        dirty: true,
      };
      setLocalOps((prev) => [...prev, newOp]);
      setSelectedClientId(newOp.clientId);
    },
    [setLocalOps, setSelectedClientId]
  );

  const handleBrowseSave = useCallback(() => {
    if (localOps.length === 0) {
      handleOpenChange(false);
      return;
    }
    const changeSet = localOpsToChangeSet(localOps, { source: 'browse-rule-manager' });
    if (changeSet) {
      addPendingChangeSet({ changeSet, source: 'browse-rule-manager' });
      toast.success(`${localOps.length} rule change${localOps.length === 1 ? '' : 's'} saved`);
    }
    handleOpenChange(false);
  }, [localOps, addPendingChangeSet]);

  // ---- browse mode keyboard nav -------------------------------------------
  const browseListRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isBrowseMode || !props.open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const list = browseFilteredRules;
        if (list.length === 0) return;
        const currentIdx = list.findIndex((r) => r.id === browseSelectedRuleId);
        let nextIdx: number;
        if (e.key === 'ArrowDown') {
          nextIdx = currentIdx < list.length - 1 ? currentIdx + 1 : 0;
        } else {
          nextIdx = currentIdx > 0 ? currentIdx - 1 : list.length - 1;
        }
        const nextRule = list[nextIdx];
        if (nextRule) handleBrowseSelectRule(nextRule.id);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isBrowseMode, props.open, browseFilteredRules, browseSelectedRuleId]);

  // ---- shared memos (must be above any early return) ----------------------

  const excludeIds = useMemo(() => {
    const set = new Set<string>();
    for (const op of localOps) {
      if (op.kind !== 'add') set.add(op.targetRuleId);
    }
    return set;
  }, [localOps]);

  // ---- render -------------------------------------------------------------

  if (isBrowseMode) {
    return (
      <Dialog open={props.open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="
            max-w-[92vw] max-h-[88vh] w-[1180px]
            md:max-w-[92vw] md:w-[1180px]
            flex flex-col gap-0 overflow-hidden p-0
          "
        >
          <DialogHeader className="px-6 pt-6 pb-3">
            <DialogTitle>Manage Rules</DialogTitle>
            <DialogDescription>
              Browse, search, and edit classification rules. Changes are buffered locally until
              import is committed.
            </DialogDescription>
          </DialogHeader>

          {browseListQuery.isError ? (
            <div className="px-6 pb-6 text-sm text-destructive">
              {browseListQuery.error.message}
            </div>
          ) : browseListQuery.isLoading ? (
            <div className="px-6 pb-6 text-sm text-muted-foreground">Loading rules…</div>
          ) : (
            <div className="grid grid-cols-[300px_minmax(0,1fr)] gap-0 border-y flex-1 min-h-0">
              {/* Sidebar: rule list with search */}
              <div className="flex flex-col min-h-0 border-r" ref={browseListRef}>
                <div className="px-3 py-2 border-b">
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={browseSearch}
                      onChange={(e) => setBrowseSearch(e.target.value)}
                      placeholder="Search rules…"
                      className="pl-7 h-8 text-xs"
                    />
                  </div>
                </div>
                <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-b">
                  {browseFilteredRules.length} rule{browseFilteredRules.length === 1 ? '' : 's'}
                  {browseSearch && ` matching "${browseSearch}"`}
                </div>
                <div className="flex-1 overflow-auto">
                  {browseFilteredRules.length === 0 ? (
                    <div className="p-4 text-sm text-muted-foreground">No rules found.</div>
                  ) : (
                    <ul className="divide-y">
                      {browseFilteredRules.map((rule) => {
                        const selected = rule.id === browseSelectedRuleId;
                        const isPending = rule.id.startsWith('temp:');
                        const hasLocalOp = localOps.some(
                          (o) => o.kind !== 'add' && o.targetRuleId === rule.id
                        );
                        return (
                          <li
                            key={rule.id}
                            className={`px-3 py-2 cursor-pointer hover:bg-muted/50 ${
                              selected ? 'bg-muted' : ''
                            }`}
                            onClick={() => handleBrowseSelectRule(rule.id)}
                          >
                            <div className="flex items-start gap-2">
                              <div className="flex-1 min-w-0 space-y-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <code className="text-xs truncate max-w-[180px]">
                                    {rule.descriptionPattern}
                                  </code>
                                  <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                                    {rule.matchType}
                                  </Badge>
                                  {isPending && (
                                    <Badge
                                      variant="default"
                                      className="text-[10px] h-4 px-1.5 bg-amber-500"
                                    >
                                      pending
                                    </Badge>
                                  )}
                                  {hasLocalOp && (
                                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                                      edited
                                    </Badge>
                                  )}
                                  {!rule.isActive && (
                                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                                      disabled
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-[11px] text-muted-foreground truncate">
                                  {[rule.entityName, rule.location, rule.transactionType]
                                    .filter(Boolean)
                                    .join(' · ') || 'no outcome set'}
                                </div>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                <div className="border-t p-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full justify-start"
                    onClick={handleAddNewRuleOp}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add new rule
                  </Button>
                </div>
              </div>

              {/* Detail: show selected rule or selected op editor */}
              <div className="flex flex-col min-h-0 overflow-auto">
                {selectedOp ? (
                  <DetailPanel
                    op={selectedOp}
                    onChange={(mutator) => {
                      if (!selectedOp) return;
                      updateOp(selectedOp.clientId, mutator);
                    }}
                    disabled={false}
                  />
                ) : browseSelectedRule ? (
                  <BrowseRuleDetailPanel
                    rule={browseSelectedRule}
                    onEdit={handleBrowseEditRule}
                    onDisable={handleBrowseDisableRule}
                    onRemove={handleBrowseRemoveRule}
                  />
                ) : (
                  <div className="p-6 text-sm text-muted-foreground">
                    Select a rule on the left to view or edit it.
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="px-6 py-4 border-t">
            <div className="flex-1 text-xs text-muted-foreground">
              {localOps.length > 0 && (
                <span>
                  {localOps.length} unsaved change{localOps.length === 1 ? '' : 's'}
                </span>
              )}
            </div>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleBrowseSave} disabled={localOps.length === 0}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ---- proposal mode render -----------------------------------------------

  const previewResult = previewView === 'combined' ? combinedPreview : selectedOpPreview;
  const previewError = previewView === 'combined' ? combinedPreviewError : selectedOpPreviewError;
  const previewTruncated =
    previewView === 'combined' ? combinedPreviewTruncated : selectedOpPreviewTruncated;
  const previewLabel =
    previewView === 'combined'
      ? 'Combined effect of entire ChangeSet'
      : selectedOp
        ? `Effect of selected operation`
        : 'No operation selected';

  return (
    <Dialog open={props.open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="
          max-w-[92vw] max-h-[88vh] w-[1180px]
          md:max-w-[92vw] md:w-[1180px]
          flex flex-col gap-0 overflow-hidden p-0
        "
      >
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle>Correction proposal</DialogTitle>
          <DialogDescription>
            Edit the proposed rule changes and preview their impact before applying.
          </DialogDescription>
        </DialogHeader>

        {!props.signal ? (
          <div className="px-6 pb-6 text-sm text-muted-foreground">
            No proposal signal provided.
          </div>
        ) : proposeQuery.isError ? (
          <div className="px-6 pb-6 text-sm text-destructive">{proposeQuery.error.message}</div>
        ) : proposeQuery.isLoading && localOps.length === 0 ? (
          <div className="px-6 pb-6 text-sm text-muted-foreground">Generating proposal…</div>
        ) : (
          <>
            <ContextPanel
              signal={props.signal}
              triggeringTransaction={props.triggeringTransaction}
              rationale={rationale}
              opCount={localOps.length}
              combinedSummary={combinedPreview?.summary ?? null}
            />

            <div className="grid grid-cols-[260px_minmax(0,1fr)_360px] gap-0 border-y flex-1 min-h-0">
              <OpsListPanel
                ops={localOps}
                selectedClientId={selectedClientId}
                onSelect={setSelectedClientId}
                onDelete={handleDeleteOp}
                onAddNewRule={handleAddNewRuleOp}
                onAddTargeted={handleAddTargetedOp}
                excludeIds={excludeIds}
                disabled={isBusy}
              />
              <DetailPanel
                op={selectedOp}
                onChange={(mutator) => {
                  if (!selectedOp) return;
                  updateOp(selectedOp.clientId, mutator);
                }}
                disabled={isBusy}
              />
              <ImpactPanel
                view={previewView}
                onViewChange={setPreviewView}
                label={previewLabel}
                previewResult={previewResult}
                previewError={previewError}
                isPending={previewMutationPending}
                stale={hasDirty}
                truncated={previewTruncated}
                onRerun={handleRerunPreview}
                disabled={isBusy || localOps.length === 0}
              />
            </div>

            {rejectMode ? (
              <RejectPanel
                feedback={rejectFeedback}
                onFeedbackChange={setRejectFeedback}
                onCancel={() => {
                  setRejectMode(false);
                  setRejectFeedback('');
                }}
                onConfirm={handleConfirmReject}
                busy={mutationsHook.rejectMutationPending}
              />
            ) : (
              <AiHelperPanel
                messages={aiMessages}
                instruction={aiInstruction}
                onInstructionChange={setAiInstruction}
                onSubmit={handleAiSubmit}
                busy={aiBusy}
              />
            )}
          </>
        )}

        <DialogFooter className="px-6 py-4 border-t">
          <div className="flex-1 text-xs text-muted-foreground">
            {hasDirty ? (
              <span>Preview stale — re-run before applying.</span>
            ) : localOps.length === 0 ? (
              <span>ChangeSet is empty.</span>
            ) : null}
          </div>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isBusy}>
            Cancel
          </Button>
          {!rejectMode && (
            <Button
              variant="outline"
              onClick={() => setRejectMode(true)}
              disabled={isBusy || localOps.length === 0}
            >
              Reject with feedback
            </Button>
          )}
          <Button onClick={handleApprove} disabled={!canApply}>
            Apply ChangeSet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
