import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { reevaluateTransactions } from '../../../lib/local-re-evaluation';
import { computeMergedRules } from '../../../lib/merged-state';
import { groupTransactionsByEntity } from '../../../lib/transaction-utils';
import { trpc } from '../../../lib/trpc';
import { useImportStore } from '../../../store/importStore';

export type ViewMode = 'list' | 'grouped';

/**
 * Manages local transaction state, view mode, scroll tracking, active tab,
 * unresolved count, and entity grouping for the ReviewStep.
 */
export function useTransactionReview() {
  // Select individually — returning a fresh object from the selector breaks
  // Zustand v5 (useSyncExternalStore-based) and produces an infinite render
  // loop (React #185). Use `useShallow` if you ever need object grouping here.
  const processedTransactions = useImportStore((s) => s.processedTransactions);
  const pendingChangeSets = useImportStore((s) => s.pendingChangeSets);

  const [localTransactions, setLocalTransactions] = useState(processedTransactions);
  const [viewMode, setViewMode] = useState<ViewMode>('grouped');

  // Default to Uncertain tab when uncertain transactions exist, otherwise Matched
  const initialTab = localTransactions.uncertain.length > 0 ? 'uncertain' : 'matched';
  const [activeTab, setActiveTab] = useState(initialTab);

  // Preserve scroll position per tab
  const scrollPositions = useRef<Map<string, number>>(new Map());
  const handleTabChange = useCallback(
    (value: string) => {
      // Save current scroll position
      scrollPositions.current.set(activeTab, window.scrollY);
      setActiveTab(value);
      // Restore scroll position for the new tab (defer to after render)
      requestAnimationFrame(() => {
        const saved = scrollPositions.current.get(value);
        window.scrollTo(0, saved ?? 0);
      });
    },
    [activeTab]
  );

  const { data: dbRulesData } = trpc.core.corrections.list.useQuery({});

  // Re-evaluate transactions when pending changeSets change (US-07 AC-8).
  // Covers both addPendingChangeSet and removePendingChangeSet.
  // On removal, rule-promoted transactions are demoted back to uncertain/failed,
  // then all are re-evaluated against the updated merged rules.
  const prevChangeSetsRef = useRef(pendingChangeSets);
  const localTxRef = useRef(localTransactions);
  localTxRef.current = localTransactions;
  useEffect(() => {
    if (prevChangeSetsRef.current === pendingChangeSets) return;
    prevChangeSetsRef.current = pendingChangeSets;
    if (!dbRulesData?.data) return;

    // tags is string[] from tRPC but string in CorrectionRow (SQLite JSON) — cast through unknown
    const freshRules = computeMergedRules(
      dbRulesData.data as unknown as Parameters<typeof computeMergedRules>[0],
      pendingChangeSets
    );
    const current = localTxRef.current;
    // Demote rule-promoted transactions back to uncertain for re-evaluation
    const rulePromoted = current.matched.filter((t) => t.ruleProvenance);
    const manuallyMatched = current.matched.filter((t) => !t.ruleProvenance);
    const candidateUncertain = [...current.uncertain, ...rulePromoted];

    const reeval = reevaluateTransactions(
      candidateUncertain,
      current.failed,
      freshRules as unknown as Parameters<typeof reevaluateTransactions>[2]
    );

    const updated = {
      ...current,
      matched: [...manuallyMatched, ...reeval.matched],
      uncertain: reeval.uncertain,
      failed: reeval.failed,
    };
    setLocalTransactions(updated);
    useImportStore.getState().setProcessedTransactions(updated);
  }, [pendingChangeSets, dbRulesData?.data]);

  // Count unresolved transactions
  const unresolvedCount = useMemo(
    () => localTransactions.uncertain.length + localTransactions.failed.length,
    [localTransactions]
  );

  // Group transactions for uncertain/failed tabs
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
