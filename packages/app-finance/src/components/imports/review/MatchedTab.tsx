import type { ProcessedTransaction } from '../../../store/importStore';
import { EditableTransactionCard } from '../EditableTransactionCard';
import { TransactionCard } from '../TransactionCard';

interface MatchedTabProps {
  transactions: ProcessedTransaction[];
  onEdit: (t: ProcessedTransaction) => void;
  onEntitySelect: (t: ProcessedTransaction, entityId: string, entityName: string) => void;
  onCreateEntity: (t: ProcessedTransaction) => void;
  editingTransaction: ProcessedTransaction | null;
  onSaveEdit: (t: ProcessedTransaction, edited: Partial<ProcessedTransaction>) => void;
  onCancelEdit: () => void;
  entities?: Array<{ id: string; name: string; type: string }>;
}

/**
 * Matched tab - read-only list
 */
export function MatchedTab({
  transactions,
  onEdit,
  onEntitySelect,
  onCreateEntity,
  editingTransaction,
  onSaveEdit,
  onCancelEdit,
  entities,
}: MatchedTabProps) {
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
