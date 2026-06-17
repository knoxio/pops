import { useMutation } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { unwrap } from '../../../finance-api-helpers.js';
import {
  importsReevaluateWithPendingRules,
  type ImportsReevaluateWithPendingRulesData,
} from '../../../finance-api/index.js';
import { toRestCorrectionChangeSet } from '../../../lib/rest-changeset';
import { groupTransactionsByEntity } from '../../../lib/transaction-utils';
import { useImportStore } from '../../../store/importStore';

type ReevaluateInput = NonNullable<ImportsReevaluateWithPendingRulesData['body']>;

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

/**
 * When pendingChangeSets changes, ask the API to re-evaluate the session
 * against (DB rules + pending). Server-side merge avoids the case where a
 * pending edit targets a rule outside the client's paginated list.
 */
function useReevalOnChangeSets(
  setLocalTransactions: React.Dispatch<
    React.SetStateAction<ReturnType<typeof useImportStore.getState>['processedTransactions']>
  >,
  pendingChangeSets: ReturnType<typeof useImportStore.getState>['pendingChangeSets'],
  sessionId: string | null
) {
  const prevChangeSetsRef = useRef(pendingChangeSets);
  const reevaluateMutation = useMutation({
    mutationFn: async (vars: ReevaluateInput) =>
      unwrap(await importsReevaluateWithPendingRules({ body: vars })),
  });
  useEffect(() => {
    if (prevChangeSetsRef.current === pendingChangeSets) return;
    prevChangeSetsRef.current = pendingChangeSets;
    if (!sessionId) return;

    reevaluateMutation.mutate(
      {
        sessionId,
        minConfidence: 0.7,
        pendingChangeSets: pendingChangeSets.map((pcs) => ({
          changeSet: toRestCorrectionChangeSet(pcs.changeSet),
        })),
      },
      {
        onSuccess: ({ result }) => {
          setLocalTransactions(result);
          useImportStore.getState().setProcessedTransactions(result);
        },
        onError: () => toast.error('Failed to re-evaluate transactions against updated rules'),
      }
    );
  }, [pendingChangeSets, sessionId, setLocalTransactions, reevaluateMutation]);
}

/**
 * Manages local transaction state, view mode, scroll tracking, active tab,
 * unresolved count, and entity grouping for the ReviewStep.
 */
export function useTransactionReview() {
  const processedTransactions = useImportStore((s) => s.processedTransactions);
  const pendingChangeSets = useImportStore((s) => s.pendingChangeSets);
  const processSessionId = useImportStore((s) => s.processSessionId);
  const [localTransactions, setLocalTransactions] = useState(processedTransactions);
  const [viewMode, setViewMode] = useState<ViewMode>('grouped');
  const initialTab = localTransactions.uncertain.length > 0 ? 'uncertain' : 'matched';
  const { activeTab, handleTabChange } = useTabWithScrollMemory(initialTab);

  useReevalOnChangeSets(setLocalTransactions, pendingChangeSets, processSessionId);

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
