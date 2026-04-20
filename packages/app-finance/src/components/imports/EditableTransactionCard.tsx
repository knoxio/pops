import { Save, X } from 'lucide-react';
import { useState } from 'react';

import { Button, EditableFormCard, Label, Select as UiSelect } from '@pops/ui';

import { EditableFormFields } from './editable-card/EditableFormFields';
import { RawDataDisclosure } from './editable-card/RawDataDisclosure';
import { EntitySelect } from './EntitySelect';

import type { ProcessedTransaction } from '@pops/api/modules/finance/imports';

type TransactionType = 'purchase' | 'transfer' | 'income';

interface EditableTransactionCardProps {
  transaction: ProcessedTransaction;
  onSave: (
    transaction: ProcessedTransaction,
    editedFields: Partial<ProcessedTransaction>,
    shouldLearn?: boolean
  ) => void;
  onCancel: () => void;
  entities?: Array<{ id: string; name: string; type: string }>;
}

function parseRaw(rawRow: string): Record<string, string> {
  try {
    return JSON.parse(rawRow);
  } catch {
    return { error: 'Failed to parse raw data' };
  }
}

function TransactionTypeSelect({
  value,
  onChange,
}: {
  value: TransactionType;
  onChange: (next: TransactionType) => void;
}) {
  return (
    <div className="mb-4 p-3 bg-info/10 rounded-lg">
      <Label htmlFor="transactionType" className="block mb-2 font-semibold">
        Transaction Type
      </Label>
      <UiSelect
        id="transactionType"
        name="type"
        value={value}
        onChange={(e) => onChange(e.target.value as TransactionType)}
        options={[
          { label: 'Purchase (requires entity)', value: 'purchase' },
          { label: 'Transfer (between accounts, no entity)', value: 'transfer' },
          { label: 'Income (salary, refund, etc.)', value: 'income' },
        ]}
      />
      <p className="text-xs mt-1 text-info">
        {value === 'transfer' &&
          "Transfers don't need an entity - they move money between accounts"}
        {value === 'income' && 'Income transactions: salary, interest, refunds, etc.'}
        {value === 'purchase' && 'Purchases require an entity (merchant/payee)'}
      </p>
    </div>
  );
}

function EditActions({
  onSave,
  onCancel,
}: {
  onSave: (shouldLearn: boolean) => void;
  onCancel: () => void;
}) {
  return (
    <>
      <Button
        variant="default"
        size="sm"
        onClick={() => onSave(true)}
        className="bg-purple-600 hover:bg-purple-700"
      >
        <Save className="w-4 h-4 mr-1" />
        Save & Learn
      </Button>
      <Button variant="outline" size="sm" onClick={() => onSave(false)}>
        <Save className="w-4 h-4 mr-1" />
        Save Once
      </Button>
      <Button variant="outline" size="sm" onClick={onCancel}>
        <X className="w-4 h-4 mr-1" />
        Cancel
      </Button>
    </>
  );
}

function EntityOrTransferNotice({
  transactionType,
  transaction,
  entities,
}: {
  transactionType: TransactionType;
  transaction: ProcessedTransaction;
  entities?: Array<{ id: string; name: string; type: string }>;
}) {
  if (transactionType === 'purchase' && entities && entities.length > 0) {
    return (
      <div className="space-y-2 mb-4">
        <Label htmlFor="entity">Entity (Merchant/Payee)</Label>
        <EntitySelect
          entities={entities}
          value={transaction.entity?.entityId || ''}
          placeholder="Select entity..."
        />
      </div>
    );
  }
  if (transactionType === 'transfer') {
    return (
      <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg mb-4 text-sm">
        <p className="text-gray-700 dark:text-gray-300">
          💡 <strong>Transfer transactions</strong> don't require an entity. They represent money
          moving between your accounts (e.g., credit card payments, savings transfers).
        </p>
      </div>
    );
  }
  return null;
}

/**
 * Inline editing form for transaction fields
 */
export function EditableTransactionCard({
  transaction,
  onSave,
  onCancel,
  entities,
}: EditableTransactionCardProps) {
  const [editedFields, setEditedFields] = useState<Partial<ProcessedTransaction>>({
    description: transaction.description,
    amount: transaction.amount,
    date: transaction.date,
    location: transaction.location || '',
    account: transaction.account,
    transactionType: transaction.transactionType ?? 'purchase',
  });

  const transactionType = editedFields.transactionType ?? 'purchase';
  const rawData = parseRaw(transaction.rawRow);

  const handleSave = (shouldLearn = false) => onSave(transaction, editedFields, shouldLearn);

  return (
    <EditableFormCard
      title="Edit Transaction"
      actions={<EditActions onSave={handleSave} onCancel={onCancel} />}
      onEscape={onCancel}
    >
      <TransactionTypeSelect
        value={transactionType}
        onChange={(next) => setEditedFields({ ...editedFields, transactionType: next })}
      />
      <EditableFormFields editedFields={editedFields} setEditedFields={setEditedFields} />
      <EntityOrTransferNotice
        transactionType={transactionType}
        transaction={transaction}
        entities={entities}
      />
      <RawDataDisclosure rawData={rawData} />
    </EditableFormCard>
  );
}
