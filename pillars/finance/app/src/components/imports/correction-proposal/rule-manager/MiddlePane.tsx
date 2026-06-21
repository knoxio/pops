import { BrowseRuleDetailPanel, DetailPanel } from '../../CorrectionProposalDialogPanels';

import type { LocalOp } from '../../correction-proposal-shared';
import type { CorrectionRule } from '../../RulePicker';

interface MiddlePaneProps {
  selectedOp: LocalOp | null;
  selectedRule: CorrectionRule | null;
  onChangeSelectedOp: (clientId: string, mutator: (op: LocalOp) => LocalOp) => void;
  onEditRule: (rule: CorrectionRule) => void;
  onDisableRule: (rule: CorrectionRule) => void;
  onRemoveRule: (rule: CorrectionRule) => void;
}

function renderMiddlePaneContent(props: MiddlePaneProps) {
  const { selectedOp, selectedRule } = props;
  if (selectedOp) {
    return (
      <DetailPanel
        op={selectedOp}
        onChange={(mutator) => props.onChangeSelectedOp(selectedOp.clientId, mutator)}
        disabled={false}
      />
    );
  }
  if (selectedRule) {
    return (
      <BrowseRuleDetailPanel
        rule={selectedRule}
        onEdit={props.onEditRule}
        onDisable={props.onDisableRule}
        onRemove={props.onRemoveRule}
      />
    );
  }
  return (
    <div className="p-6 text-sm text-muted-foreground">
      Select a rule on the left to view or edit it.
    </div>
  );
}

export function MiddlePane(props: MiddlePaneProps) {
  return (
    <div className="flex flex-col min-h-0 overflow-auto">{renderMiddlePaneContent(props)}</div>
  );
}
