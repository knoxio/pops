import { Plus, Search } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';
import { Button, Input, WorkflowDialog } from '@pops/ui';

import {
  applyBrowsePriorityReorder,
  sortRulesForBrowseDisplay,
} from '../../../lib/correction-browse-reorder';
import { computeMergedRules } from '../../../lib/merged-state';
import { useImportStore } from '../../../store/importStore';
import {
  BrowseRuleDetailPanel,
  DetailPanel,
  ImpactPanel,
  type PreviewView,
} from '../CorrectionProposalDialogPanels';
import { localOpsToChangeSet, newClientId, useLocalOps } from '../hooks/useLocalOps';
import { usePreviewEffects } from '../hooks/usePreviewEffects';

import type { LocalOp, PreviewChangeSetOutput } from '../correction-proposal-shared';
import type { CorrectionRule } from '../RulePicker';

const BrowseRulesSidebar = lazy(() =>
  import('../BrowseRulesSidebar').then((m) => ({ default: m.BrowseRulesSidebar }))
);

export interface CorrectionRuleManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBrowseClose?: (hadChanges: boolean) => void;
  minConfidence: number;
  previewTransactions: Array<{ checksum?: string; description: string }>;
}

export function CorrectionRuleManagerDialog({
  open,
  onOpenChange,
  onBrowseClose,
  minConfidence,
  previewTransactions,
}: CorrectionRuleManagerDialogProps) {
  const pendingChangeSets = useImportStore((s) => s.pendingChangeSets);
  const addPendingChangeSet = useImportStore((s) => s.addPendingChangeSet);

  const localOpsHook = useLocalOps({
    open,
    signal: null,
    isBrowseMode: true,
    proposeData: undefined,
  });

  const { localOps, setLocalOps, selectedOp, setSelectedClientId, updateOp, handleAddNewRuleOp } =
    localOpsHook;

  const [previewView, setPreviewView] = useState<PreviewView>('selected');
  const [browseSearch, setBrowseSearch] = useState('');
  const [browseSelectedRuleId, setBrowseSelectedRuleId] = useState<string | null>(null);
  const browseInitialPendingCountRef = useRef<number>(0);

  const dbTxnsQuery = trpc.finance.transactions.listDescriptionsForPreview.useQuery(undefined, {
    enabled: open,
    staleTime: 60_000,
  });

  const previewHook = usePreviewEffects(
    {
      open,
      localOps,
      selectedOp,
      minConfidence,
      previewTransactions,
      dbTransactions: dbTxnsQuery.data?.data ?? [],
      pendingChangeSets,
    },
    setLocalOps
  );

  const {
    combinedPreview,
    combinedPreviewError,
    combinedPreviewTruncated,
    combinedDbPreview,
    selectedOpPreview,
    selectedOpPreviewError,
    selectedOpPreviewTruncated,
    selectedOpDbPreview,
    previewMutationPending,
    hasDirty,
    handleRerunPreview,
    resetPreviewState,
  } = previewHook;

  const browseListQuery = trpc.core.corrections.list.useQuery(
    { limit: 500, offset: 0 },
    { enabled: open, staleTime: 30_000 }
  );

  const browseMergedRules: CorrectionRule[] = useMemo(() => {
    const browseDbRules = browseListQuery.data?.data ?? [];
    if (pendingChangeSets.length === 0) return browseDbRules;
    return computeMergedRules(browseDbRules, pendingChangeSets);
  }, [browseListQuery.data?.data, pendingChangeSets]);

  const browseOrderedMerged = useMemo(
    () => sortRulesForBrowseDisplay(browseMergedRules, localOps),
    [browseMergedRules, localOps]
  );

  const browseOrderedFiltered = useMemo(() => {
    const needle = browseSearch.trim().toLowerCase();
    if (!needle) return browseOrderedMerged;
    return browseOrderedMerged.filter((r) => {
      const haystack =
        `${r.descriptionPattern} ${r.entityName ?? ''} ${r.matchType} ${r.location ?? ''}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [browseOrderedMerged, browseSearch]);

  const browseCanDragReorder = browseSearch.trim() === '' && browseOrderedMerged.length >= 2;
  const browseSelectedRule = useMemo(
    () => browseMergedRules.find((r) => r.id === browseSelectedRuleId) ?? null,
    [browseMergedRules, browseSelectedRuleId]
  );

  useEffect(() => {
    if (open) {
      browseInitialPendingCountRef.current = useImportStore.getState().pendingChangeSets.length;
    }
  }, [open]);

  const handleBrowseReorderFullList = useCallback(
    (reordered: CorrectionRule[]) => {
      setLocalOps((prev) => applyBrowsePriorityReorder(reordered, prev));
    },
    [setLocalOps]
  );

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        const currentCount = useImportStore.getState().pendingChangeSets.length;
        const hadChanges = currentCount !== browseInitialPendingCountRef.current;
        setBrowseSearch('');
        setBrowseSelectedRuleId(null);
        setLocalOps([]);
        setSelectedClientId(null);
        setPreviewView('selected');
        resetPreviewState();
        onOpenChange(false);
        onBrowseClose?.(hadChanges);
        return;
      }
      onOpenChange(true);
    },
    [onOpenChange, onBrowseClose, resetPreviewState, setLocalOps, setSelectedClientId]
  );

  const handleBrowseSelectRule = useCallback(
    (ruleId: string) => {
      setBrowseSelectedRuleId(ruleId);
      const existingOp = localOps.find((o) => o.kind !== 'add' && o.targetRuleId === ruleId);
      setSelectedClientId(existingOp ? existingOp.clientId : null);
    },
    [localOps, setSelectedClientId]
  );

  const appendBrowseOp = useCallback(
    (newOp: LocalOp) => {
      setLocalOps((prev) => [...prev, newOp]);
      setSelectedClientId(newOp.clientId);
    },
    [setLocalOps, setSelectedClientId]
  );

  const handleBrowseEditRule = useCallback(
    (rule: CorrectionRule) => {
      appendBrowseOp({
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
      });
    },
    [appendBrowseOp]
  );

  const handleBrowseDisableRule = useCallback(
    (rule: CorrectionRule) => {
      appendBrowseOp({
        kind: 'disable',
        clientId: newClientId('disable'),
        targetRuleId: rule.id,
        targetRule: rule,
        rationale: '',
        dirty: true,
      });
    },
    [appendBrowseOp]
  );

  const handleBrowseRemoveRule = useCallback(
    (rule: CorrectionRule) => {
      appendBrowseOp({
        kind: 'remove',
        clientId: newClientId('remove'),
        targetRuleId: rule.id,
        targetRule: rule,
        rationale: '',
        dirty: true,
      });
    },
    [appendBrowseOp]
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
  }, [addPendingChangeSet, handleOpenChange, localOps]);

  const isGridMode = !browseListQuery.isError && !browseListQuery.isLoading;

  return (
    <WorkflowDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Manage Rules"
      description="Browse, search, and edit classification rules. Changes are buffered locally until import is committed."
      columns={isGridMode ? 3 : undefined}
      gridTemplate={isGridMode ? 'grid-cols-[300px_minmax(0,1fr)_360px]' : undefined}
      footer={
        <RuleManagerFooter
          localOpsCount={localOps.length}
          onCancel={() => handleOpenChange(false)}
          onSave={handleBrowseSave}
        />
      }
    >
      <RuleManagerBody
        errorMessage={browseListQuery.isError ? browseListQuery.error.message : null}
        isLoading={browseListQuery.isLoading}
        search={browseSearch}
        onSearchChange={setBrowseSearch}
        orderedMerged={browseOrderedMerged}
        orderedFiltered={browseOrderedFiltered}
        canDragReorder={browseCanDragReorder}
        selectedRuleId={browseSelectedRuleId}
        onSelectRule={handleBrowseSelectRule}
        onReorderFullList={handleBrowseReorderFullList}
        localOps={localOps}
        selectedOp={selectedOp}
        onChangeSelectedOp={updateOp}
        selectedRule={browseSelectedRule}
        onEditRule={handleBrowseEditRule}
        onDisableRule={handleBrowseDisableRule}
        onRemoveRule={handleBrowseRemoveRule}
        onAddNewRule={handleAddNewRuleOp}
        previewView={previewView}
        onPreviewViewChange={setPreviewView}
        previewCombined={combinedPreview}
        previewSelected={selectedOpPreview}
        dbPreviewCombined={combinedDbPreview}
        dbPreviewSelected={selectedOpDbPreview}
        previewErrorCombined={combinedPreviewError}
        previewErrorSelected={selectedOpPreviewError}
        truncatedCombined={combinedPreviewTruncated}
        truncatedSelected={selectedOpPreviewTruncated}
        dbTruncated={dbTxnsQuery.data?.truncated}
        dbTotal={dbTxnsQuery.data?.total}
        isPreviewPending={previewMutationPending}
        isPreviewStale={hasDirty}
        onRerunPreview={handleRerunPreview}
        disablePreview={localOps.length === 0}
      />
    </WorkflowDialog>
  );
}

function RuleManagerFooter(props: {
  localOpsCount: number;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <>
      <div className="flex-1 text-xs text-muted-foreground">
        {props.localOpsCount > 0 && (
          <span>
            {props.localOpsCount} unsaved change{props.localOpsCount === 1 ? '' : 's'}
          </span>
        )}
      </div>
      <Button variant="outline" onClick={props.onCancel}>
        Cancel
      </Button>
      <Button onClick={props.onSave} disabled={props.localOpsCount === 0}>
        Save Changes
      </Button>
    </>
  );
}

function RuleManagerBody(props: {
  errorMessage: string | null;
  isLoading: boolean;
  search: string;
  onSearchChange: (v: string) => void;
  orderedMerged: CorrectionRule[];
  orderedFiltered: CorrectionRule[];
  canDragReorder: boolean;
  selectedRuleId: string | null;
  onSelectRule: (ruleId: string) => void;
  onReorderFullList: (reordered: CorrectionRule[]) => void;
  localOps: LocalOp[];
  selectedOp: LocalOp | null;
  onChangeSelectedOp: (clientId: string, mutator: (op: LocalOp) => LocalOp) => void;
  selectedRule: CorrectionRule | null;
  onEditRule: (rule: CorrectionRule) => void;
  onDisableRule: (rule: CorrectionRule) => void;
  onRemoveRule: (rule: CorrectionRule) => void;
  onAddNewRule: () => void;
  previewView: PreviewView;
  onPreviewViewChange: (v: PreviewView) => void;
  previewCombined: PreviewChangeSetOutput | null;
  previewSelected: PreviewChangeSetOutput | null;
  dbPreviewCombined: PreviewChangeSetOutput | null;
  dbPreviewSelected: PreviewChangeSetOutput | null;
  previewErrorCombined: string | null;
  previewErrorSelected: string | null;
  truncatedCombined: boolean;
  truncatedSelected: boolean;
  dbTruncated: boolean | undefined;
  dbTotal: number | undefined;
  isPreviewPending: boolean;
  isPreviewStale: boolean;
  onRerunPreview: () => void;
  disablePreview: boolean;
}) {
  if (props.errorMessage) {
    return <div className="px-6 pb-6 text-sm text-destructive">{props.errorMessage}</div>;
  }
  if (props.isLoading) {
    return <div className="px-6 pb-6 text-sm text-muted-foreground">Loading rules…</div>;
  }

  const label =
    props.previewView === 'combined'
      ? 'Combined effect of all pending changes'
      : props.selectedOp
        ? 'Effect of selected operation'
        : 'No operation selected';

  const previewResult =
    props.previewView === 'combined' ? props.previewCombined : props.previewSelected;
  const dbPreviewResult =
    props.previewView === 'combined' ? props.dbPreviewCombined : props.dbPreviewSelected;
  const previewError =
    props.previewView === 'combined' ? props.previewErrorCombined : props.previewErrorSelected;
  const truncated =
    props.previewView === 'combined' ? props.truncatedCombined : props.truncatedSelected;

  return (
    <>
      <div className="flex flex-col min-h-0 border-r">
        <div className="px-3 py-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={props.search}
              onChange={(e) => props.onSearchChange(e.target.value)}
              placeholder="Search rules…"
              className="pl-7 h-8 text-xs"
            />
          </div>
        </div>
        <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-b space-y-0.5">
          <div>
            {props.orderedFiltered.length} rule{props.orderedFiltered.length === 1 ? '' : 's'}
            {props.search && ` matching "${props.search}"`}
          </div>
          {props.search.trim() !== '' && (
            <div className="text-[10px] text-muted-foreground/90">
              Clear search to drag rules into priority order.
            </div>
          )}
        </div>
        <div className="flex-1 overflow-auto">
          <Suspense fallback={<div className="p-3 text-xs text-muted-foreground">Loading…</div>}>
            <BrowseRulesSidebar
              canDragReorder={props.canDragReorder}
              orderedMerged={props.orderedMerged}
              orderedFiltered={props.orderedFiltered}
              selectedRuleId={props.selectedRuleId}
              localOps={props.localOps}
              onSelectRule={props.onSelectRule}
              onReorderFullList={props.onReorderFullList}
            />
          </Suspense>
        </div>
        <div className="border-t p-2">
          <Button
            size="sm"
            variant="outline"
            className="w-full justify-start"
            onClick={props.onAddNewRule}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Add new rule
          </Button>
        </div>
      </div>

      <div className="flex flex-col min-h-0 overflow-auto">
        {props.selectedOp ? (
          <DetailPanel
            op={props.selectedOp}
            onChange={(mutator) => {
              if (props.selectedOp) props.onChangeSelectedOp(props.selectedOp.clientId, mutator);
            }}
            disabled={false}
          />
        ) : props.selectedRule ? (
          <BrowseRuleDetailPanel
            rule={props.selectedRule}
            onEdit={props.onEditRule}
            onDisable={props.onDisableRule}
            onRemove={props.onRemoveRule}
          />
        ) : (
          <div className="p-6 text-sm text-muted-foreground">
            Select a rule on the left to view or edit it.
          </div>
        )}
      </div>

      <ImpactPanel
        view={props.previewView}
        onViewChange={props.onPreviewViewChange}
        label={label}
        previewResult={previewResult}
        dbPreviewResult={dbPreviewResult}
        dbTruncated={props.dbTruncated}
        dbTotal={props.dbTotal}
        previewError={previewError}
        isPending={props.isPreviewPending}
        stale={props.isPreviewStale}
        truncated={truncated}
        onRerun={props.onRerunPreview}
        disabled={props.disablePreview}
      />
    </>
  );
}
