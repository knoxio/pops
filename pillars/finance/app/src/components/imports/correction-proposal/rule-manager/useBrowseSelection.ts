import { useCallback, useState } from 'react';

import { newClientId } from '../../hooks/useLocalOps';

import type { LocalOp } from '../../correction-proposal-shared';
import type { CorrectionRule } from '../../RulePicker';

interface UseBrowseSelectionArgs {
  setLocalOps: React.Dispatch<React.SetStateAction<LocalOp[]>>;
  setSelectedClientId: React.Dispatch<React.SetStateAction<string | null>>;
  localOps: LocalOp[];
}

function buildEditOp(rule: CorrectionRule): LocalOp {
  return {
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
}

function buildSimpleOp(kind: 'disable' | 'remove', rule: CorrectionRule): LocalOp {
  return {
    kind,
    clientId: newClientId(kind),
    targetRuleId: rule.id,
    targetRule: rule,
    rationale: '',
    dirty: true,
  } as LocalOp;
}

export function useBrowseSelection({
  setLocalOps,
  setSelectedClientId,
  localOps,
}: UseBrowseSelectionArgs) {
  const [browseSelectedRuleId, setBrowseSelectedRuleId] = useState<string | null>(null);
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
    (rule: CorrectionRule) => appendBrowseOp(buildEditOp(rule)),
    [appendBrowseOp]
  );
  const handleBrowseDisableRule = useCallback(
    (rule: CorrectionRule) => appendBrowseOp(buildSimpleOp('disable', rule)),
    [appendBrowseOp]
  );
  const handleBrowseRemoveRule = useCallback(
    (rule: CorrectionRule) => appendBrowseOp(buildSimpleOp('remove', rule)),
    [appendBrowseOp]
  );
  return {
    browseSelectedRuleId,
    setBrowseSelectedRuleId,
    handleBrowseSelectRule,
    handleBrowseEditRule,
    handleBrowseDisableRule,
    handleBrowseRemoveRule,
  };
}
