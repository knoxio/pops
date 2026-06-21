import { ImpactPanel, type PreviewView } from '../../CorrectionProposalDialogPanels';
import { MiddlePane } from './MiddlePane';
import { Sidebar } from './Sidebar';

import type { LocalOp, PreviewChangeSetOutput } from '../../correction-proposal-shared';
import type { CorrectionRule } from '../../RulePicker';

interface RuleManagerBodyProps {
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
}

function getPreviewLabel(previewView: PreviewView, hasSelectedOp: boolean): string {
  if (previewView === 'combined') return 'Combined effect of all pending changes';
  if (hasSelectedOp) return 'Effect of selected operation';
  return 'No operation selected';
}

interface PreviewSlot {
  result: PreviewChangeSetOutput | null;
  dbResult: PreviewChangeSetOutput | null;
  error: string | null;
  truncated: boolean;
}

function pickPreviewSlot(props: RuleManagerBodyProps): PreviewSlot {
  const isCombined = props.previewView === 'combined';
  return {
    result: isCombined ? props.previewCombined : props.previewSelected,
    dbResult: isCombined ? props.dbPreviewCombined : props.dbPreviewSelected,
    error: isCombined ? props.previewErrorCombined : props.previewErrorSelected,
    truncated: isCombined ? props.truncatedCombined : props.truncatedSelected,
  };
}

export function RuleManagerBody(props: RuleManagerBodyProps) {
  if (props.errorMessage) {
    return <div className="px-6 pb-6 text-sm text-destructive">{props.errorMessage}</div>;
  }
  if (props.isLoading) {
    return <div className="px-6 pb-6 text-sm text-muted-foreground">Loading rules…</div>;
  }
  const slot = pickPreviewSlot(props);
  return (
    <>
      <Sidebar
        search={props.search}
        onSearchChange={props.onSearchChange}
        orderedMerged={props.orderedMerged}
        orderedFiltered={props.orderedFiltered}
        canDragReorder={props.canDragReorder}
        selectedRuleId={props.selectedRuleId}
        onSelectRule={props.onSelectRule}
        onReorderFullList={props.onReorderFullList}
        localOps={props.localOps}
        onAddNewRule={props.onAddNewRule}
      />
      <MiddlePane
        selectedOp={props.selectedOp}
        selectedRule={props.selectedRule}
        onChangeSelectedOp={props.onChangeSelectedOp}
        onEditRule={props.onEditRule}
        onDisableRule={props.onDisableRule}
        onRemoveRule={props.onRemoveRule}
      />
      <ImpactPanel
        view={props.previewView}
        onViewChange={props.onPreviewViewChange}
        label={getPreviewLabel(props.previewView, Boolean(props.selectedOp))}
        previewResult={slot.result}
        dbPreviewResult={slot.dbResult}
        dbTruncated={props.dbTruncated}
        dbTotal={props.dbTotal}
        previewError={slot.error}
        isPending={props.isPreviewPending}
        stale={props.isPreviewStale}
        truncated={slot.truncated}
        onRerun={props.onRerunPreview}
        disabled={props.disablePreview}
      />
    </>
  );
}
