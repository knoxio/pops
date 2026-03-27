import { useState, useCallback, useMemo, useRef } from "react";
import { CheckCircle, AlertTriangle, XCircle, AlertCircle, List, Layers } from "lucide-react";
import { useImportStore } from "../../store/importStore";
import type { ProcessedTransaction } from "../../store/importStore";
import { trpc } from "../../lib/trpc";
import { Button } from "@pops/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@pops/ui";
import { EntityCreateDialog } from "./EntityCreateDialog";
import { TransactionCard } from "./TransactionCard";
import { TransactionGroup } from "./TransactionGroup";
import { EditableTransactionCard } from "./EditableTransactionCard";
import { toast } from "sonner";
import type { ConfirmedTransaction } from "@pops/api/modules/finance/imports";
import { groupTransactionsByEntity } from "../../lib/transaction-utils";

type ViewMode = "list" | "grouped";

/**
 * Step 4: Review transactions and resolve uncertain/failed matches
 */
export function ReviewStep() {
  const { processedTransactions, setConfirmedTransactions, nextStep, prevStep, findSimilar } =
    useImportStore();

  const [localTransactions, setLocalTransactions] = useState(processedTransactions);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<ProcessedTransaction | null>(null);
  const [pendingBulkTransactions, setPendingBulkTransactions] = useState<
    ProcessedTransaction[] | null
  >(null);
  const [editingTransaction, setEditingTransaction] = useState<ProcessedTransaction | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("grouped");

  // Default to Uncertain tab when uncertain transactions exist, otherwise Matched
  const initialTab = localTransactions.uncertain.length > 0 ? "uncertain" : "matched";
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

  const { data: entities } = trpc.core.entities.list.useQuery({});

  const utils = trpc.useUtils();
  const createEntityMutation = trpc.core.entities.create.useMutation({
    onSuccess: () => {
      // Refresh entities list
      utils.core.entities.list.invalidate();
    },
  });

  // Count unresolved transactions
  const unresolvedCount = useMemo(
    () => localTransactions.uncertain.length + localTransactions.failed.length,
    [localTransactions]
  );

  /**
   * Auto-match similar transactions
   */
  const handleAutoMatchSimilar = useCallback(
    (transactions: ProcessedTransaction[], entityId: string, entityName: string) => {
      setLocalTransactions((prev) => {
        let updated = { ...prev };
        for (const transaction of transactions) {
          updated = {
            ...updated,
            uncertain: updated.uncertain.filter((t: ProcessedTransaction) => t !== transaction),
            failed: updated.failed.filter((t: ProcessedTransaction) => t !== transaction),
            matched: [
              ...updated.matched,
              {
                ...transaction,
                entity: {
                  entityId,
                  entityName,
                  matchType: "auto-matched" as never, // UI-only matchType
                  confidence: 1,
                },
                status: "matched" as const,
              } as ProcessedTransaction,
            ],
          };
        }
        return updated;
      });
      toast.success(
        `Applied entity to ${transactions.length} transaction${transactions.length !== 1 ? "s" : ""}`
      );
    },
    []
  );

  /**
   * Handle entity selection with auto-matching for similar transactions
   */
  const handleEntitySelect = useCallback(
    (transaction: ProcessedTransaction, entityId: string, entityName: string) => {
      // Find similar transactions before updating
      const similar = findSimilar(transaction);

      // Move transaction from uncertain/failed to matched (functional setState avoids stale closure)
      setLocalTransactions((prev) => ({
        ...prev,
        uncertain: prev.uncertain.filter((t: ProcessedTransaction) => t !== transaction),
        failed: prev.failed.filter((t: ProcessedTransaction) => t !== transaction),
        matched: [
          ...prev.matched,
          {
            ...transaction,
            entity: {
              entityId,
              entityName,
              matchType: "manual" as never, // UI-only matchType
              confidence: 1,
            },
            status: "matched" as const,
          } as ProcessedTransaction,
        ],
      }));

      // Show toast with option to apply to similar transactions
      if (similar.length > 0) {
        toast.info(
          `Found ${similar.length} similar transaction${similar.length !== 1 ? "s" : ""}`,
          {
            description: "Would you like to apply this entity to all similar transactions?",
            action: {
              label: "Apply to All",
              onClick: () => {
                handleAutoMatchSimilar(similar, entityId, entityName);
              },
            },
          }
        );
      }
    },
    [findSimilar, handleAutoMatchSimilar]
  );

  const handleCreateEntity = useCallback((transaction: ProcessedTransaction) => {
    setSelectedTransaction(transaction);
    setShowCreateDialog(true);
  }, []);

  const createCorrectionMutation = trpc.core.corrections.createOrUpdate.useMutation();

  /**
   * Auto-save a correction rule, re-evaluate remaining uncertain/failed transactions,
   * move matches to the matched tab, and show a toast with the result.
   */
  const autoSaveRuleAndReEvaluate = useCallback(
    (description: string, entityId: string, entityName: string) => {
      const pattern = description.toUpperCase().replace(/\d+/g, "").replace(/\s+/g, " ").trim();

      createCorrectionMutation.mutate({
        descriptionPattern: pattern,
        matchType: "contains",
        entityId,
        entityName,
      });

      // Re-evaluate and move matching transactions in a single state update.
      // Toast is called inside the updater so it has access to the computed count.
      const normalizedEntityName = entityName.toUpperCase();

      setLocalTransactions((prev) => {
        const toMove: ProcessedTransaction[] = [];
        const remainingUncertain: ProcessedTransaction[] = [];
        const remainingFailed: ProcessedTransaction[] = [];

        for (const t of prev.uncertain) {
          if (t.description.toUpperCase().includes(normalizedEntityName)) {
            toMove.push(t);
          } else {
            remainingUncertain.push(t);
          }
        }

        for (const t of prev.failed) {
          if (t.description.toUpperCase().includes(normalizedEntityName)) {
            toMove.push(t);
          } else {
            remainingFailed.push(t);
          }
        }

        if (toMove.length > 0) {
          toast.success(
            `Rule created: "${entityName}". Applied to ${toMove.length} more transaction${toMove.length !== 1 ? "s" : ""}`
          );
        } else {
          toast.success(`Rule created: "${entityName}"`);
        }

        if (toMove.length === 0) return prev;

        return {
          ...prev,
          uncertain: remainingUncertain,
          failed: remainingFailed,
          matched: [
            ...prev.matched,
            ...toMove.map(
              (t) =>
                ({
                  ...t,
                  entity: {
                    entityId,
                    entityName,
                    matchType: "learned" as never,
                    confidence: 0.8,
                  },
                  status: "matched" as const,
                }) as ProcessedTransaction
            ),
          ],
        };
      });
    },
    [createCorrectionMutation]
  );

  /**
   * Accept AI suggestion for a single transaction.
   * Auto-saves a correction rule and re-evaluates remaining transactions.
   */
  const handleAcceptAiSuggestion = useCallback(
    (transaction: ProcessedTransaction) => {
      if (!transaction.entity?.entityName) return;

      // Try to find entity by name if entityId is missing
      let entityId = transaction.entity.entityId;
      if (!entityId && entities?.data) {
        const matchingEntity = entities.data.find(
          (e) => e.name.toLowerCase() === transaction.entity?.entityName?.toLowerCase()
        );
        if (matchingEntity) {
          entityId = matchingEntity.id;
        }
      }

      // Entity doesn't exist yet, need to create it first
      if (!entityId) {
        handleCreateEntity(transaction);
        return;
      }

      handleEntitySelect(transaction, entityId, transaction.entity.entityName);

      // Auto-save correction rule and re-evaluate remaining transactions
      autoSaveRuleAndReEvaluate(transaction.description, entityId, transaction.entity.entityName);
    },
    [handleEntitySelect, entities, handleCreateEntity, autoSaveRuleAndReEvaluate]
  );

  /**
   * Accept all transactions in a group (create entity if needed)
   */
  const handleAcceptAll = useCallback(
    async (transactions: ProcessedTransaction[]) => {
      if (transactions.length === 0) return;

      const firstTx = transactions[0];
      const entityName = firstTx?.entity?.entityName;
      if (!entityName) {
        toast.error("No entity name found");
        return;
      }

      try {
        // Check if entity exists
        let entityId = entities?.data?.find(
          (e) => e.name.toLowerCase() === entityName.toLowerCase()
        )?.id;

        // Create entity if it doesn't exist
        if (!entityId) {
          const result = await createEntityMutation.mutateAsync({
            name: entityName,
          });
          entityId = result.data.id;
        }

        const resolvedEntityId = entityId;

        // Assign to all transactions (functional setState avoids stale closure)
        setLocalTransactions((prev) => {
          let updated = { ...prev };
          for (const transaction of transactions) {
            updated = {
              ...updated,
              uncertain: updated.uncertain.filter((t: ProcessedTransaction) => t !== transaction),
              failed: updated.failed.filter((t: ProcessedTransaction) => t !== transaction),
              matched: [
                ...updated.matched,
                {
                  ...transaction,
                  entity: {
                    entityId: resolvedEntityId,
                    entityName,
                    matchType: "ai" as const,
                    confidence: 1,
                  },
                  status: "matched" as const,
                } as ProcessedTransaction,
              ],
            };
          }
          return updated;
        });
        toast.success(
          `Accepted ${transactions.length} transaction${transactions.length !== 1 ? "s" : ""}`
        );

        // Auto-save correction rule using the first transaction's description and re-evaluate
        if (firstTx) {
          autoSaveRuleAndReEvaluate(firstTx.description, resolvedEntityId, entityName);
        }
      } catch (error) {
        toast.error(
          `Failed to accept: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    },
    [entities, createEntityMutation, autoSaveRuleAndReEvaluate]
  );

  /**
   * Open dialog to create entity and assign to all transactions in group
   */
  const handleCreateAndAssignAll = useCallback(
    (transactions: ProcessedTransaction[], _entityName: string) => {
      // Store transactions for bulk assignment after creation
      setPendingBulkTransactions(transactions);
      // Use first transaction as the "selected" one to get the suggested name
      const first = transactions[0];
      setSelectedTransaction(first ?? null);
      setShowCreateDialog(true);
    },
    []
  );

  const handleEntityCreated = useCallback(
    (entity: { entityId: string; entityName: string }) => {
      // Handle bulk assignment if pending
      if (pendingBulkTransactions && pendingBulkTransactions.length > 0) {
        const bulkCount = pendingBulkTransactions.length;
        setLocalTransactions((prev) => {
          let updated = { ...prev };
          for (const transaction of pendingBulkTransactions) {
            updated = {
              ...updated,
              uncertain: updated.uncertain.filter((t: ProcessedTransaction) => t !== transaction),
              failed: updated.failed.filter((t: ProcessedTransaction) => t !== transaction),
              matched: [
                ...updated.matched,
                {
                  ...transaction,
                  entity: {
                    entityId: entity.entityId,
                    entityName: entity.entityName,
                    matchType: "ai" as const,
                    confidence: 1,
                  },
                  status: "matched" as const,
                } as ProcessedTransaction,
              ],
            };
          }
          return updated;
        });
        setPendingBulkTransactions(null);
        setSelectedTransaction(null);
        toast.success(
          `Created "${entity.entityName}" and assigned to ${bulkCount} transaction${bulkCount !== 1 ? "s" : ""}`
        );
      } else if (selectedTransaction) {
        // Handle single transaction assignment
        handleEntitySelect(selectedTransaction, entity.entityId, entity.entityName);
        setSelectedTransaction(null);
      }
    },
    [selectedTransaction, pendingBulkTransactions, handleEntitySelect]
  );

  const handleEdit = useCallback((transaction: ProcessedTransaction) => {
    setEditingTransaction(transaction);
  }, []);

  const handleSaveEdit = useCallback(
    (
      transaction: ProcessedTransaction,
      editedFields: Partial<ProcessedTransaction>,
      shouldLearn: boolean = false
    ) => {
      const updatedTx: ProcessedTransaction = {
        ...transaction,
        ...editedFields,
        manuallyEdited: true,
      };
      const isNoEntityType =
        updatedTx.transactionType === "transfer" || updatedTx.transactionType === "income";

      setLocalTransactions((prev) => {
        // Transfers and income don't need an entity — promote them straight to matched.
        if (isNoEntityType) {
          return {
            ...prev,
            matched: prev.matched.some((t) => t === transaction)
              ? prev.matched.map((t) =>
                  t === transaction ? { ...updatedTx, status: "matched" as const } : t
                )
              : [...prev.matched, { ...updatedTx, status: "matched" as const }],
            uncertain: prev.uncertain.filter((t) => t !== transaction),
            failed: prev.failed.filter((t) => t !== transaction),
            skipped: prev.skipped.filter((t) => t !== transaction),
          };
        }

        return {
          ...prev,
          matched: prev.matched.map((t: ProcessedTransaction) =>
            t === transaction ? { ...t, ...editedFields, manuallyEdited: true } : t
          ),
          uncertain: prev.uncertain.map((t: ProcessedTransaction) =>
            t === transaction ? { ...t, ...editedFields, manuallyEdited: true } : t
          ),
          failed: prev.failed.map((t: ProcessedTransaction) =>
            t === transaction ? { ...t, ...editedFields, manuallyEdited: true } : t
          ),
          skipped: prev.skipped.map((t: ProcessedTransaction) =>
            t === transaction ? { ...t, ...editedFields, manuallyEdited: true } : t
          ),
        };
      });
      setEditingTransaction(null);

      // Detect what changed (include description/amount changes so Save & Learn works for any edit)
      const hasChanges =
        editedFields.description !== transaction.description ||
        editedFields.amount !== transaction.amount ||
        editedFields.entity?.entityId !== transaction.entity?.entityId ||
        editedFields.location !== transaction.location ||
        editedFields.online !== transaction.online;

      if (shouldLearn && hasChanges) {
        // Save correction pattern
        createCorrectionMutation.mutate({
          descriptionPattern: transaction.description,
          matchType: "exact",
          entityId: editedFields.entity?.entityId ?? transaction.entity?.entityId,
          entityName: editedFields.entity?.entityName ?? transaction.entity?.entityName,
          location: editedFields.location ?? transaction.location,
        });
        toast.success("Correction saved!");
      } else if (hasChanges && !shouldLearn) {
        // Show toast asking if they want to learn
        toast.info("Apply this correction to future imports?", {
          description: "This will help auto-match similar transactions next time.",
          action: {
            label: "Learn Pattern",
            onClick: () => {
              createCorrectionMutation.mutate({
                descriptionPattern: transaction.description,
                matchType: "exact",
                entityId: editedFields.entity?.entityId ?? transaction.entity?.entityId,
                entityName: editedFields.entity?.entityName ?? transaction.entity?.entityName,
                location: editedFields.location ?? transaction.location,
              });
              toast.success("Pattern saved!");
            },
          },
        });
        toast.success("Transaction updated");
      } else {
        toast.success("Transaction updated");
      }
    },
    [createCorrectionMutation]
  );

  const handleCancelEdit = useCallback(() => {
    setEditingTransaction(null);
  }, []);

  const handleContinueToTagReview = useCallback(() => {
    const confirmed: ConfirmedTransaction[] = localTransactions.matched
      .filter((t: ProcessedTransaction) => {
        const isNoEntityType = t.transactionType === "transfer" || t.transactionType === "income";
        return isNoEntityType || (t.entity?.entityId && t.entity?.entityName);
      })
      .map((t: ProcessedTransaction) => ({
        date: t.date,
        description: t.description,
        amount: t.amount,
        account: t.account,
        location: t.location,
        online: t.online,
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

  // Group transactions for uncertain/failed tabs
  const uncertainGroups = useMemo(
    () => groupTransactionsByEntity(localTransactions.uncertain),
    [localTransactions.uncertain]
  );

  const failedGroups = useMemo(
    () => groupTransactionsByEntity(localTransactions.failed),
    [localTransactions.failed]
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2">Review</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {unresolvedCount > 0
            ? `${unresolvedCount} transaction(s) need your attention`
            : "All transactions are ready to import"}
        </p>
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
                      {warning.type === "AI_CATEGORIZATION_UNAVAILABLE"
                        ? "AI Categorization Unavailable"
                        : "AI API Error"}
                    </p>
                    <p className="text-xs">{warning.message}</p>
                    {warning.details && (
                      <p className="text-xs opacity-70 font-mono">{warning.details}</p>
                    )}
                    {warning.affectedCount && (
                      <p className="text-xs opacity-80">
                        {warning.affectedCount} transaction
                        {warning.affectedCount !== 1 ? "s" : ""} could not be automatically
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
            entities={entities?.data}
          />
        </TabsContent>

        <TabsContent value="uncertain" className="mt-4">
          <UncertainTab
            transactions={localTransactions.uncertain}
            groups={uncertainGroups}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onEntitySelect={handleEntitySelect}
            onCreateEntity={handleCreateEntity}
            onAcceptAiSuggestion={handleAcceptAiSuggestion}
            onAcceptAll={handleAcceptAll}
            onCreateAndAssignAll={handleCreateAndAssignAll}
            onEdit={handleEdit}
            editingTransaction={editingTransaction}
            onSaveEdit={handleSaveEdit}
            onCancelEdit={handleCancelEdit}
            entities={entities?.data}
          />
        </TabsContent>

        <TabsContent value="failed" className="mt-4">
          <FailedTab
            transactions={localTransactions.failed}
            groups={failedGroups}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onEntitySelect={handleEntitySelect}
            onCreateEntity={handleCreateEntity}
            onAcceptAiSuggestion={handleAcceptAiSuggestion}
            onAcceptAll={handleAcceptAll}
            onCreateAndAssignAll={handleCreateAndAssignAll}
            onEdit={handleEdit}
            editingTransaction={editingTransaction}
            onSaveEdit={handleSaveEdit}
            onCancelEdit={handleCancelEdit}
            entities={entities?.data}
          />
        </TabsContent>

        <TabsContent value="skipped" className="mt-4">
          <SkippedTab transactions={localTransactions.skipped} />
        </TabsContent>
      </Tabs>

      <div className="flex justify-between gap-3 items-center">
        <Button variant="outline" onClick={prevStep}>
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
      />
    </div>
  );
}

/**
 * Matched tab - read-only list
 */
function MatchedTab({
  transactions,
  onEdit,
  onEntitySelect,
  onCreateEntity,
  editingTransaction,
  onSaveEdit,
  onCancelEdit,
  entities,
}: {
  transactions: ProcessedTransaction[];
  onEdit: (t: ProcessedTransaction) => void;
  onEntitySelect: (t: ProcessedTransaction, entityId: string, entityName: string) => void;
  onCreateEntity: (t: ProcessedTransaction) => void;
  editingTransaction: ProcessedTransaction | null;
  onSaveEdit: (t: ProcessedTransaction, edited: Partial<ProcessedTransaction>) => void;
  onCancelEdit: () => void;
  entities?: Array<{ id: string; name: string; type: string }>;
}) {
  if (transactions.length === 0) {
    return <div className="text-center py-12 text-gray-500">No matched transactions</div>;
  }

  return (
    <div className="space-y-3">
      {transactions.map((t, idx) =>
        editingTransaction === t ? (
          <EditableTransactionCard
            key={idx}
            transaction={t}
            onSave={onSaveEdit}
            onCancel={onCancelEdit}
            entities={entities}
          />
        ) : (
          <TransactionCard
            key={idx}
            transaction={t}
            onEdit={onEdit}
            onEntitySelect={onEntitySelect}
            onCreateEntity={onCreateEntity}
            entities={entities}
            readonly={false}
            showMatchType={true}
            variant="matched"
          />
        )
      )}
    </div>
  );
}

/**
 * Uncertain tab - needs user review
 */
function UncertainTab({
  transactions,
  groups,
  viewMode,
  onViewModeChange,
  onEntitySelect,
  onCreateEntity,
  onAcceptAiSuggestion,
  onAcceptAll,
  onCreateAndAssignAll,
  onEdit,
  editingTransaction,
  onSaveEdit,
  onCancelEdit,
  entities,
}: {
  transactions: ProcessedTransaction[];
  groups: ReturnType<typeof groupTransactionsByEntity>;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onEntitySelect: (t: ProcessedTransaction, entityId: string, entityName: string) => void;
  onCreateEntity: (t: ProcessedTransaction) => void;
  onAcceptAiSuggestion: (t: ProcessedTransaction) => void;
  onAcceptAll: (transactions: ProcessedTransaction[]) => void;
  onCreateAndAssignAll: (transactions: ProcessedTransaction[], entityName: string) => void;
  onEdit: (t: ProcessedTransaction) => void;
  editingTransaction: ProcessedTransaction | null;
  onSaveEdit: (t: ProcessedTransaction, edited: Partial<ProcessedTransaction>) => void;
  onCancelEdit: () => void;
  entities?: Array<{ id: string; name: string; type: string }>;
}) {
  if (transactions.length === 0) {
    return <div className="text-center py-12 text-gray-500">No uncertain transactions</div>;
  }

  return (
    <div className="space-y-4">
      {/* View mode toggle */}
      <div className="flex items-center justify-end gap-2">
        <Button
          variant={viewMode === "list" ? "default" : "outline"}
          size="sm"
          onClick={() => onViewModeChange("list")}
          aria-pressed={viewMode === "list"}
        >
          <List className="w-4 h-4 mr-1" aria-hidden="true" />
          List
        </Button>
        <Button
          variant={viewMode === "grouped" ? "default" : "outline"}
          size="sm"
          onClick={() => onViewModeChange("grouped")}
          aria-pressed={viewMode === "grouped"}
        >
          <Layers className="w-4 h-4 mr-1" aria-hidden="true" />
          Grouped
        </Button>
      </div>

      {/* Grouped view */}
      {viewMode === "grouped" ? (
        <div className="space-y-3">
          {groups.map((group, idx) => (
            <TransactionGroup
              key={idx}
              group={group}
              onAcceptAll={onAcceptAll}
              onCreateAndAssignAll={onCreateAndAssignAll}
              onEntitySelect={onEntitySelect}
              onCreateEntity={onCreateEntity}
              onAcceptAiSuggestion={onAcceptAiSuggestion}
              onEdit={onEdit}
              editingTransaction={editingTransaction}
              onSaveEdit={onSaveEdit}
              onCancelEdit={onCancelEdit}
              entities={entities}
              variant="uncertain"
            />
          ))}
        </div>
      ) : (
        /* List view */
        <div className="space-y-3">
          {transactions.map((t, idx) =>
            editingTransaction === t ? (
              <EditableTransactionCard
                key={idx}
                transaction={t}
                onSave={onSaveEdit}
                onCancel={onCancelEdit}
                entities={entities}
              />
            ) : (
              <TransactionCard
                key={idx}
                transaction={t}
                onEntitySelect={onEntitySelect}
                onCreateEntity={onCreateEntity}
                onAcceptAiSuggestion={onAcceptAiSuggestion}
                onEdit={onEdit}
                entities={entities}
                variant="uncertain"
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Failed tab - needs user action
 */
function FailedTab({
  transactions,
  groups,
  viewMode,
  onViewModeChange,
  onEntitySelect,
  onCreateEntity,
  onAcceptAiSuggestion,
  onAcceptAll,
  onCreateAndAssignAll,
  onEdit,
  editingTransaction,
  onSaveEdit,
  onCancelEdit,
  entities,
}: {
  transactions: ProcessedTransaction[];
  groups: ReturnType<typeof groupTransactionsByEntity>;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onEntitySelect: (t: ProcessedTransaction, entityId: string, entityName: string) => void;
  onCreateEntity: (t: ProcessedTransaction) => void;
  onAcceptAiSuggestion: (t: ProcessedTransaction) => void;
  onAcceptAll: (transactions: ProcessedTransaction[]) => void;
  onCreateAndAssignAll: (transactions: ProcessedTransaction[], entityName: string) => void;
  onEdit: (t: ProcessedTransaction) => void;
  editingTransaction: ProcessedTransaction | null;
  onSaveEdit: (t: ProcessedTransaction, edited: Partial<ProcessedTransaction>) => void;
  onCancelEdit: () => void;
  entities?: Array<{ id: string; name: string; type: string }>;
}) {
  if (transactions.length === 0) {
    return <div className="text-center py-12 text-gray-500">No failed transactions</div>;
  }

  return (
    <div className="space-y-4">
      {/* View mode toggle */}
      <div className="flex items-center justify-end gap-2">
        <Button
          variant={viewMode === "list" ? "default" : "outline"}
          size="sm"
          onClick={() => onViewModeChange("list")}
          aria-pressed={viewMode === "list"}
        >
          <List className="w-4 h-4 mr-1" aria-hidden="true" />
          List
        </Button>
        <Button
          variant={viewMode === "grouped" ? "default" : "outline"}
          size="sm"
          onClick={() => onViewModeChange("grouped")}
          aria-pressed={viewMode === "grouped"}
        >
          <Layers className="w-4 h-4 mr-1" aria-hidden="true" />
          Grouped
        </Button>
      </div>

      {/* Grouped view */}
      {viewMode === "grouped" ? (
        <div className="space-y-3">
          {groups.map((group, idx) => (
            <TransactionGroup
              key={idx}
              group={group}
              onAcceptAll={onAcceptAll}
              onCreateAndAssignAll={onCreateAndAssignAll}
              onEntitySelect={onEntitySelect}
              onCreateEntity={onCreateEntity}
              onAcceptAiSuggestion={onAcceptAiSuggestion}
              onEdit={onEdit}
              editingTransaction={editingTransaction}
              onSaveEdit={onSaveEdit}
              onCancelEdit={onCancelEdit}
              entities={entities}
              variant="failed"
            />
          ))}
        </div>
      ) : (
        /* List view */
        <div className="space-y-3">
          {transactions.map((t, idx) =>
            editingTransaction === t ? (
              <EditableTransactionCard
                key={idx}
                transaction={t}
                onSave={onSaveEdit}
                onCancel={onCancelEdit}
                entities={entities}
              />
            ) : (
              <TransactionCard
                key={idx}
                transaction={t}
                onEntitySelect={onEntitySelect}
                onCreateEntity={onCreateEntity}
                onAcceptAiSuggestion={onAcceptAiSuggestion}
                onEdit={onEdit}
                entities={entities}
                variant="failed"
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Skipped tab - read-only list
 */
function SkippedTab({ transactions }: { transactions: ProcessedTransaction[] }) {
  if (transactions.length === 0) {
    return <div className="text-center py-12 text-gray-500">No skipped transactions</div>;
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Date</th>
              <th className="px-4 py-2 text-left font-medium">Description</th>
              <th className="px-4 py-2 text-left font-medium">Amount</th>
              <th className="px-4 py-2 text-left font-medium">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-gray-700">
            {transactions.map((t, idx) => (
              <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                <td className="px-4 py-2">{t.date}</td>
                <td className="px-4 py-2">{t.description}</td>
                <td className="px-4 py-2">${Math.abs(t.amount).toFixed(2)}</td>
                <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
                  {t.skipReason}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
