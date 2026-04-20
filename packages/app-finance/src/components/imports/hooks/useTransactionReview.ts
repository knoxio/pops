import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { trpc } from '@pops/api-client';

import { reevaluateTransactions } from '../../../lib/local-re-evaluation';
import { computeMergedRules } from '../../../lib/merged-state';
import { groupTransactionsByEntity } from '../../../lib/transaction-utils';
import { useImportStore } from '../../../store/importStore';

export type ViewMode = 'list' | 'grouped';

function useTabWithScrollMemory(initialTab: string) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const scrollPositions = useRef<Map<string, number>>(new Map());
  const handleTabChange = useCallback(
    (value: string) => {
      scrollPositions.current.set(activeTab, window.scrollY);
      setActiveTab(value);
      requestAnimationFrame(() => {
        const saved = scrollPositions.current.get(value);
        window.scrollTo(0, saved ?? 0);
      });
    },
    [activeTab]
  );
  return { activeTab, handleTabChange };
}

function useReevalOnChangeSets(
  localTransactions: ReturnType<typeof useImportStore.getState>['processedTransactions'],
  setLocalTransactions: React.Dispatch<
    React.SetStateAction<ReturnType<typeof useImportStore.getState>['processedTransactions']>
  >,
  pendingChangeSets: ReturnType<typeof useImportStore.getState>['pendingChangeSets']
) {
  const { data: dbRulesData } = trpc.core.corrections.list.useQuery({});
  const prevChangeSetsRef = useRef(pendingChangeSets);
  const localTxRef = useRef(localTransactions);
  localTxRef.current = localTransactions;
  useEffect(() => {
    if (prevChangeSetsRef.current === pendingChangeSets) return;
    prevChangeSetsRef.current = pendingChangeSets;
    if (!dbRulesData?.data) return;
    const freshRules = computeMergedRules(dbRulesData.data, pendingChangeSets);
    const current = localTxRef.current;
    const rulePromoted = current.matched.filter((t) => t.ruleProvenance);
    const manuallyMatched = current.matched.filter((t) => !t.ruleProvenance);
    const reeval = reevaluateTransactions(
      [...current.uncertain, ...rulePromoted],
      current.failed,
      freshRules
    );
    const updated = {
      ...current,
      matched: [...manuallyMatched, ...reeval.matched],
      uncertain: reeval.uncertain,
      failed: reeval.failed,
    };
    setLocalTransactions(updated);
    useImportStore.getState().setProcessedTransactions(updated);
  }, [pendingChangeSets, dbRulesData?.data, setLocalTransactions]);
}

/**
 * Manages local transaction state, view mode, scroll tracking, active tab,
 * unresolved count, and entity grouping for the ReviewStep.
 */
export function useTransactionReview() {
  const processedTransactions = useImportStore((s) => s.processedTransactions);
  const pendingChangeSets = useImportStore((s) => s.pendingChangeSets);
  const [localTransactions, setLocalTransactions] = useState(processedTransactions);
  const [viewMode, setViewMode] = useState<ViewMode>('grouped');
  const initialTab = localTransactions.uncertain.length > 0 ? 'uncertain' : 'matched';
  const { activeTab, handleTabChange } = useTabWithScrollMemory(initialTab);

  useReevalOnChangeSets(localTransactions, setLocalTransactions, pendingChangeSets);

  const unresolvedCount = useMemo(
    () => localTransactions.uncertain.length + localTransactions.failed.length,
    [localTransactions]
  );
  const uncertainGroups = useMemo(
    () => groupTransactionsByEntity(localTransactions.uncertain),
    [localTransactions.uncertain]
  );
  const failedGroups = useMemo(
    () => groupTransactionsByEntity(localTransactions.failed),
    [localTransactions.failed]
  );

  return {
    localTransactions,
    setLocalTransactions,
    viewMode,
    setViewMode,
    activeTab,
    handleTabChange,
    unresolvedCount,
    uncertainGroups,
    failedGroups,
  };
}
