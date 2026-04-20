import {
  CardHeader,
  FieldGrid,
  getCardClasses,
  parseRawData,
  RawDataSection,
} from './transaction-card/CardChrome';
import { EntitySection, ReadonlyEntitySummary } from './transaction-card/EntitySection';

import type { ProcessedTransaction } from '@pops/api/modules/finance/imports';

interface TransactionCardProps {
  transaction: ProcessedTransaction;
  onEntitySelect?: (
    transaction: ProcessedTransaction,
    entityId: string,
    entityName: string
  ) => void;
  onCreateEntity?: (transaction: ProcessedTransaction) => void;
  onAcceptAiSuggestion?: (transaction: ProcessedTransaction) => void;
  onEdit?: (transaction: ProcessedTransaction) => void;
  entities?: Array<{ id: string; name: string; type: string }>;
  readonly?: boolean;
  showMatchType?: boolean;
  variant?: 'matched' | 'uncertain' | 'failed';
}

/**
 * Reusable transaction card component with expandable raw data
 */
export function TransactionCard({
  transaction,
  onEntitySelect,
  onCreateEntity,
  onAcceptAiSuggestion,
  onEdit,
  entities,
  readonly = false,
  showMatchType = false,
  variant = 'matched',
}: TransactionCardProps) {
  const { border, bg } = getCardClasses(variant);
  const rawData = parseRawData(transaction.rawRow);
  return (
    <div
      className={`border rounded-lg p-4 ${border} ${bg}`}
      data-testid="transaction-card"
      aria-label={transaction.description}
    >
      <CardHeader transaction={transaction} onEdit={onEdit} readonly={readonly} />
      <FieldGrid transaction={transaction} />
      {!readonly && (
        <EntitySection
          transaction={transaction}
          entities={entities}
          onEntitySelect={onEntitySelect}
          onCreateEntity={onCreateEntity}
          onAcceptAiSuggestion={onAcceptAiSuggestion}
        />
      )}
      {readonly && (
        <ReadonlyEntitySummary transaction={transaction} showMatchType={showMatchType} />
      )}
      {transaction.error && (
        <div className="text-sm text-destructive mb-3">{transaction.error}</div>
      )}
      <RawDataSection rawData={rawData} />
    </div>
  );
}
