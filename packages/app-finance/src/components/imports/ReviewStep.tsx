import { AlertCircle, AlertTriangle, CheckCircle, Settings2, XCircle } from 'lucide-react';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { Button } from '@pops/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@pops/ui';

import { trpc } from '../../lib/trpc';
import { useImportStore } from '../../store/importStore';
import { CorrectionProposalDialog } from './CorrectionProposalDialog';
import { EntityCreateDialog } from './EntityCreateDialog';
import { useBulkAssignment } from './hooks/useBulkAssignment';
import { useProposalGeneration } from './hooks/useProposalGeneration';
import { useTransactionEditing } from './hooks/useTransactionEditing';
import { useTransactionReview } from './hooks/useTransactionReview';
import { FailedTab } from './review/FailedTab';
import { MatchedTab } from './review/MatchedTab';
import { SkippedTab } from './review/SkippedTab';
import { UncertainTab } from './review/UncertainTab';

import type { ConfirmedTransaction } from '@pops/api/modules/finance/imports';

import type { ProcessedTransaction } from '../../store/importStore';

/**
 * Step 4: Review transactions and resolve uncertain/failed matches
 */
export function ReviewStep() {
  const {
    processedTransactions,
    processSessionId,
    setConfirmedTransactions,
    nextStep,
    goToStep,
    findSimilar,
  } = useImportStore();

  const pendingChangeSets = useImportStore((s) => s.pendingChangeSets);

  const {
    localTransactions,
    setLocalTransactions,
    viewMode,
    setViewMode,
    activeTab,
    handleTabChange,
    unresolvedCount,
    uncertainGroups,
    failedGroups,
  } = useTransactionReview();

  const {
    proposalOpen,
    setProposalOpen,
    proposalSignal,
    proposalTriggeringTransaction,
    browseOpen,
    setBrowseOpen,
    generateProposal,
    openRuleProposalDialog,
  } = useProposalGeneration();

  const handleBulkEntitySelect = useCallback(
    (transactions: ProcessedTransaction[], entityId: string, entityName: string) => {
      if (transactions.length === 0) return;

      setLocalTransactions((prev) => {
        let updated = { ...prev };
        for (const transaction of transactions) {
          updated = {
            ...updated,
            uncertain: updated.uncertain.filter(
              (t: ProcessedTransaction) => t.checksum !== transaction.checksum
            ),
            failed: updated.failed.filter(
              (t: ProcessedTransaction) => t.checksum !== transaction.checksum
            ),
            matched: [
              ...updated.matched,
              {
                ...transaction,
                entity: {
                  entityId,
                  entityName,
                  matchType: 'manual',
                  confidence: 1,
                },
                status: 'matched' as const,
              } as ProcessedTransaction,
            ],
          };
        }
        return updated;
      });

      // Route through proposal dialog using the first transaction in the group
      // to seed the pattern analysis.
      const firstTx = transactions[0];
      if (firstTx) {
        void generateProposal({
          triggeringTransaction: firstTx,
          entityId,
          entityName,
          location: firstTx.location ?? null,
          transactionType: firstTx.transactionType ?? null,
        });
      }
    },
    [generateProposal, setLocalTransactions]
  );

  /**
   * Handle entity selection. Always resolves the one transaction the user
   * picked for, then — if there are similar transactions in the session —
   * opens the CorrectionProposalDialog so the user can confirm the cascade
   * AND learn a persistent rule.
   */
  const handleEntitySelect = useCallback(
    (transaction: ProcessedTransaction, entityId: string, entityName: string) => {
      const similar = findSimilar(transaction);

      // Resolve the single transaction the user explicitly picked for.
      setLocalTransactions((prev) => ({
        ...prev,
        uncertain: prev.uncertain.filter(
          (t: ProcessedTransaction) => t.checksum !== transaction.checksum
        ),
        failed: prev.failed.filter(
          (t: ProcessedTransaction) => t.checksum !== transaction.checksum
        ),
        matched: [
          ...prev.matched,
          {
            ...transaction,
            entity: {
              entityId,
              entityName,
              matchType: 'manual', // UI-only matchType
              confidence: 1,
            },
            status: 'matched' as const,
          } as ProcessedTransaction,
        ],
      }));

      // If there are similar txns in the session, route through the proposal
      // dialog so the user sees the matching transactions, the rule that
      // would be learned, and must explicitly approve before the cascade.
      if (similar.length > 0) {
        void generateProposal({
          triggeringTransaction: transaction,
          entityId,
          entityName,
          location: transaction.location ?? null,
          transactionType: transaction.transactionType ?? null,
        });
      }
    },
    [findSimilar, generateProposal, setLocalTransactions]
  );

  const { editingTransaction, handleEdit, handleSaveEdit, handleCancelEdit } =
    useTransactionEditing({
      setLocalTransactions,
      generateProposal,
    });

  const {
    showCreateDialog,
    setShowCreateDialog,
    selectedTransaction,
    setSelectedTransaction,
    setPendingBulkTransactions,
    entities,
    dbEntitiesData,
    handleCreateEntity,
    handleAcceptAiSuggestion,
    handleAcceptAll,
    handleCreateAndAssignAll,
    handleEntityCreated,
  } = useBulkAssignment({
    setLocalTransactions,
    handleEntitySelect,
    openRuleProposalDialog,
    generateProposal,
  });

  const reevaluateWithPendingRulesMutation =
    trpc.finance.imports.reevaluateWithPendingRules.useMutation();

  const handleContinueToTagReview = useCallback(() => {
    const confirmed: ConfirmedTransaction[] = localTransactions.matched
      .filter((t: ProcessedTransaction) => {
        const isNoEntityType = t.transactionType === 'transfer' || t.transactionType === 'income';
        return isNoEntityType || (t.entity?.entityId && t.entity?.entityName);
      })
      .map((t: ProcessedTransaction) => ({
        date: t.date,
        description: t.description,
        amount: t.amount,
        account: t.account,
        location: t.location,
        rawRow: t.rawRow,
        checksum: t.checksum,
        transactionType: t.transactionType,
        entityId: t.entity?.entityId,
        entityName: t.entity?.entityName,
        // Pre-populate tags from suggestedTags so TagReviewStep can display them
        tags: (t.suggestedTags ?? []).map((s) => s.tag),
        // Pass source attribution metadata for TagReviewStep badges
        suggestedTags: t.suggestedTags,
      }));

    setConfirmedTransactions(confirmed);
    nextStep();
  }, [localTransactions, setConfirmedTransactions, nextStep]);

  const allPreviewTransactions = [
    ...localTransactions.matched,
    ...localTransactions.uncertain,
    ...localTransactions.failed,
    ...localTransactions.skipped,
  ].map((t) => ({ checksum: t.checksum, description: t.description }));

  return (
    <div className="space-y-6">
      <CorrectionProposalDialog
        open={proposalOpen}
        onOpenChange={setProposalOpen}
        sessionId={processSessionId ?? ''}
        signal={proposalSignal}
        triggeringTransaction={proposalTriggeringTransaction}
        previewTransactions={allPreviewTransactions}
        onApproved={() => {
          // Re-evaluation is handled by the pendingChangeSets useEffect (US-07 AC-8).
          toast.success('Rules saved locally');
        }}
      />
      <CorrectionProposalDialog
        open={browseOpen}
        onOpenChange={setBrowseOpen}
        mode="browse"
        sessionId={processSessionId ?? ''}
        signal={null}
        triggeringTransaction={null}
        previewTransactions={allPreviewTransactions}
        onBrowseClose={(hadChanges) => {
          if (hadChanges && processSessionId && pendingChangeSets.length > 0) {
            reevaluateWithPendingRulesMutation.mutate(
              {
                sessionId: processSessionId,
                minConfidence: 0.7,
                pendingChangeSets: pendingChangeSets.map((pcs) => ({
                  changeSet: pcs.changeSet,
                })),
              },
              {
                onSuccess: ({ result, affectedCount }) => {
                  setLocalTransactions(result);
                  toast.success(
                    `Rules applied — ${affectedCount} transaction${affectedCount === 1 ? '' : 's'} re-evaluated`
                  );
                },
                onError: () => {
                  toast.error('Failed to re-evaluate transactions against updated rules');
                },
              }
            );
          }
        }}
      />
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-semibold mb-2">Review</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {unresolvedCount > 0
              ? `${unresolvedCount} transaction(s) need your attention`
              : 'All transactions are ready to import'}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setBrowseOpen(true);
          }}
          disabled={browseOpen}
        >
          <Settings2 className="mr-1.5 h-4 w-4" />
          Manage Rules
        </Button>
      </div>

      {/* Show warnings if present */}
      {processedTransactions.warnings && processedTransactions.warnings.length > 0 && (
        <div className="space-y-2">
          {processedTransactions.warnings.map((warning, idx: number) => {
            return (
              <div
                key={idx}
                className="p-4 text-sm rounded-lg border text-warning bg-warning/10 border-warning/25"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1">
                    <p className="font-medium">
                      {warning.type === 'AI_CATEGORIZATION_UNAVAILABLE'
                        ? 'AI Categorization Unavailable'
                        : 'AI API Error'}
                    </p>
                    <p className="text-xs">{warning.message}</p>
                    {warning.details && (
                      <p className="text-xs opacity-70 font-mono">{warning.details}</p>
                    )}
                    {warning.affectedCount && (
                      <p className="text-xs opacity-80">
                        {warning.affectedCount} transaction
                        {warning.affectedCount !== 1 ? 's' : ''} could not be automatically
                        categorized and may appear in the Uncertain or Failed tabs.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="matched" className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            <span>Matched ({localTransactions.matched.length})</span>
          </TabsTrigger>
          <TabsTrigger value="uncertain" className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span>Uncertain ({localTransactions.uncertain.length})</span>
          </TabsTrigger>
          <TabsTrigger value="failed" className="flex items-center gap-2">
            <XCircle className="w-4 h-4" />
            <span>Failed ({localTransactions.failed.length})</span>
          </TabsTrigger>
          <TabsTrigger value="skipped" className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>Skipped ({localTransactions.skipped.length})</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="matched" className="mt-4">
          <MatchedTab
            transactions={localTransactions.matched}
            onEdit={handleEdit}
            onEntitySelect={handleEntitySelect}
            onCreateEntity={handleCreateEntity}
            editingTransaction={editingTransaction}
            onSaveEdit={handleSaveEdit}
            onCancelEdit={handleCancelEdit}
            entities={entities}
          />
        </TabsContent>

        <TabsContent value="uncertain" className="mt-4">
          <UncertainTab
            transactions={localTransactions.uncertain}
            groups={uncertainGroups}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onEntitySelect={handleEntitySelect}
            onBulkEntitySelect={handleBulkEntitySelect}
            onCreateEntity={handleCreateEntity}
            onAcceptAiSuggestion={handleAcceptAiSuggestion}
            onAcceptAll={handleAcceptAll}
            onCreateAndAssignAll={handleCreateAndAssignAll}
            onEdit={handleEdit}
            editingTransaction={editingTransaction}
            onSaveEdit={handleSaveEdit}
            onCancelEdit={handleCancelEdit}
            entities={entities}
          />
        </TabsContent>

        <TabsContent value="failed" className="mt-4">
          <FailedTab
            transactions={localTransactions.failed}
            groups={failedGroups}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onEntitySelect={handleEntitySelect}
            onBulkEntitySelect={handleBulkEntitySelect}
            onCreateEntity={handleCreateEntity}
            onAcceptAiSuggestion={handleAcceptAiSuggestion}
            onAcceptAll={handleAcceptAll}
            onCreateAndAssignAll={handleCreateAndAssignAll}
            onEdit={handleEdit}
            editingTransaction={editingTransaction}
            onSaveEdit={handleSaveEdit}
            onCancelEdit={handleCancelEdit}
            entities={entities}
          />
        </TabsContent>

        <TabsContent value="skipped" className="mt-4">
          <SkippedTab transactions={localTransactions.skipped} />
        </TabsContent>
      </Tabs>

      <div className="flex justify-between gap-3 items-center">
        <Button
          variant="outline"
          onClick={() => {
            goToStep(2);
          }}
          title="Back to column mapping"
        >
          Back
        </Button>
        <div className="flex flex-col items-end gap-1">
          {unresolvedCount > 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Resolve all uncertain/failed transactions to continue
            </p>
          )}
          <Button onClick={handleContinueToTagReview} disabled={unresolvedCount > 0}>
            {`Continue to Tag Review (${localTransactions.matched.length})`}
          </Button>
        </div>
      </div>

      <EntityCreateDialog
        open={showCreateDialog}
        onOpenChange={(open) => {
          setShowCreateDialog(open);
          if (!open) {
            // Clear pending state when dialog is closed
            setPendingBulkTransactions(null);
            setSelectedTransaction(null);
          }
        }}
        onEntityCreated={handleEntityCreated}
        suggestedName={selectedTransaction?.entity?.entityName}
        dbEntities={dbEntitiesData?.data}
      />
    </div>
  );
}
