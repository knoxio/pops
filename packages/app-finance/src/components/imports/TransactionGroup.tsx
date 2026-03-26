import { useState } from "react";
import { ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@pops/ui";
import { Badge } from "@pops/ui";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@pops/ui";
import { TransactionCard } from "./TransactionCard";
import { EditableTransactionCard } from "./EditableTransactionCard";
import type { ProcessedTransaction } from "@pops/api/modules/finance/imports";
import type { TransactionGroup as TransactionGroupType } from "../../lib/transaction-utils";

interface TransactionGroupProps {
  group: TransactionGroupType;
  onAcceptAll: (transactions: ProcessedTransaction[]) => void;
  onCreateAndAssignAll: (transactions: ProcessedTransaction[], entityName: string) => void;
  onEntitySelect: (transaction: ProcessedTransaction, entityId: string, entityName: string) => void;
  onCreateEntity: (transaction: ProcessedTransaction) => void;
  onAcceptAiSuggestion: (transaction: ProcessedTransaction) => void;
  onEdit: (transaction: ProcessedTransaction) => void;
  editingTransaction?: ProcessedTransaction | null;
  onSaveEdit?: (
    transaction: ProcessedTransaction,
    editedFields: Partial<ProcessedTransaction>
  ) => void;
  onCancelEdit?: () => void;
  entities?: Array<{ id: string; name: string }>;
  variant?: "uncertain" | "failed";
}

/**
 * Grouped view of transactions with bulk actions
 */
export function TransactionGroup({
  group,
  onAcceptAll,
  onCreateAndAssignAll,
  onEntitySelect,
  onCreateEntity,
  onAcceptAiSuggestion,
  onEdit,
  editingTransaction,
  onSaveEdit,
  onCancelEdit,
  entities,
  variant = "uncertain",
}: TransactionGroupProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showEntitySelector, setShowEntitySelector] = useState(false);

  const totalAmount = group.transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);

  // Check if AI-suggested entity exists
  const entityExists =
    group.aiSuggestion &&
    entities?.some((e) => e.name.toLowerCase() === group.entityName.toLowerCase());

  return (
    <div
      className={`border rounded-lg ${
        group.aiSuggestion
          ? "border-purple-300 dark:border-purple-700"
          : "border-gray-200 dark:border-gray-700"
      }`}
      data-testid="transaction-group"
    >
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <div
          className={`p-4 ${
            group.aiSuggestion ? "bg-purple-50 dark:bg-purple-950" : "bg-gray-50 dark:bg-gray-900"
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CollapsibleTrigger
                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                aria-label={isExpanded ? "Collapse" : "Expand"}
              >
                <ChevronRight
                  className={`w-5 h-5 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                  aria-hidden="true"
                />
                <div className="flex items-center gap-2">
                  {group.aiSuggestion && (
                    <Sparkles className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  )}
                  <h3 className="font-semibold text-lg">{group.entityName}</h3>
                </div>
              </CollapsibleTrigger>

              <div className="flex items-center gap-3 mt-2 ml-7">
                <Badge variant="secondary">
                  {group.transactions.length} transaction
                  {group.transactions.length !== 1 ? "s" : ""}
                </Badge>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Total: ${totalAmount.toFixed(2)}
                </span>
                {group.category && (
                  <Badge variant="outline" className="text-xs">
                    {group.category}
                  </Badge>
                )}
              </div>
            </div>

            {/* Bulk actions */}
            <div className="flex gap-2">
              {group.aiSuggestion && (
                <>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => onAcceptAll(group.transactions)}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    {entityExists ? "✓" : "+"} Accept All as "{group.entityName}"
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onCreateAndAssignAll(group.transactions, group.entityName)}
                  >
                    Create new for all
                  </Button>
                </>
              )}
              {!group.aiSuggestion && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onCreateAndAssignAll(group.transactions, group.entityName)}
                >
                  + Create new for all
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowEntitySelector(!showEntitySelector)}
              >
                Choose existing...
              </Button>
            </div>
          </div>
        </div>

        {/* Entity selector for bulk assignment */}
        {showEntitySelector && entities && entities.length > 0 && (
          <div className="mt-3 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-600">
            <label className="block text-sm font-medium mb-2">
              Select entity to assign to all {group.transactions.length} transactions:
            </label>
            <select
              className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-800"
              onChange={(e) => {
                const selectedEntity = entities.find((ent) => ent.id === e.target.value);
                if (selectedEntity) {
                  // Apply selected entity to all transactions in group
                  group.transactions.forEach((t) => {
                    onEntitySelect(t, selectedEntity.id, selectedEntity.name);
                  });
                  setShowEntitySelector(false);
                }
              }}
              defaultValue=""
            >
              <option value="">Choose entity...</option>
              {entities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <CollapsibleContent>
          <div className="p-4 space-y-3 border-t dark:border-gray-700">
            {group.transactions.map((transaction, idx) =>
              editingTransaction === transaction && onSaveEdit && onCancelEdit ? (
                <EditableTransactionCard
                  key={idx}
                  transaction={transaction}
                  onSave={onSaveEdit}
                  onCancel={onCancelEdit}
                  entities={entities}
                />
              ) : (
                <TransactionCard
                  key={idx}
                  transaction={transaction}
                  onEntitySelect={onEntitySelect}
                  onCreateEntity={onCreateEntity}
                  onAcceptAiSuggestion={onAcceptAiSuggestion}
                  onEdit={onEdit}
                  entities={entities}
                  variant={variant}
                />
              )
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
