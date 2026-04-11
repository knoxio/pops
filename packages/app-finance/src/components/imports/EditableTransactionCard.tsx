import { useState } from "react";
import { Save, X, ChevronRight } from "lucide-react";
import { Button } from "@pops/ui";
import { Input } from "@pops/ui";
import { Label } from "@pops/ui";
import { Select as UiSelect } from "@pops/ui";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@pops/ui";
import { EntitySelect } from "./EntitySelect";
import type { ProcessedTransaction } from "@pops/api/modules/finance/imports";

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

/**
 * Inline editing form for transaction fields
 */
export function EditableTransactionCard({
  transaction,
  onSave,
  onCancel,
  entities,
}: EditableTransactionCardProps) {
  const [isRawDataExpanded, setIsRawDataExpanded] = useState(false);
  const [editedFields, setEditedFields] = useState<Partial<ProcessedTransaction>>({
    description: transaction.description,
    amount: transaction.amount,
    date: transaction.date,
    location: transaction.location || "",
    account: transaction.account,
    transactionType: transaction.transactionType ?? "purchase",
  });

  const transactionType = editedFields.transactionType ?? "purchase";

  // Parse raw row for reference
  let rawData: Record<string, string> = {};
  try {
    rawData = JSON.parse(transaction.rawRow);
  } catch {
    rawData = { error: "Failed to parse raw data" };
  }

  const handleSave = (shouldLearn: boolean = false) => {
    onSave(transaction, editedFields, shouldLearn);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onCancel();
    }
  };

  return (
    <div
      className="border-2 border-blue-500 rounded-lg p-4 bg-blue-50 dark:bg-blue-950"
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div className="flex justify-between items-center mb-4 pb-2 border-b border-blue-200 dark:border-blue-800">
        <h3 className="font-semibold text-blue-900 dark:text-blue-100">Edit Transaction</h3>
        <div className="flex gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={() => handleSave(true)}
            className="bg-purple-600 hover:bg-purple-700"
          >
            <Save className="w-4 h-4 mr-1" />
            Save & Learn
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleSave(false)}>
            <Save className="w-4 h-4 mr-1" />
            Save Once
          </Button>
          <Button variant="outline" size="sm" onClick={onCancel}>
            <X className="w-4 h-4 mr-1" />
            Cancel
          </Button>
        </div>
      </div>

      {/* Transaction Type */}
      <div className="mb-4 p-3 bg-blue-100 dark:bg-blue-900 rounded-lg">
        <Label htmlFor="transactionType" className="block mb-2 font-semibold">
          Transaction Type
        </Label>
        <UiSelect
          id="transactionType"
          name="type"
          value={transactionType}
          onChange={(e) =>
            setEditedFields({
              ...editedFields,
              transactionType: e.target.value as "purchase" | "transfer" | "income",
            })
          }
          options={[
            { label: "Purchase (requires entity)", value: "purchase" },
            { label: "Transfer (between accounts, no entity)", value: "transfer" },
            { label: "Income (salary, refund, etc.)", value: "income" },
          ]}
        />
        <p className="text-xs mt-1 text-blue-700 dark:text-blue-300">
          {transactionType === "transfer" &&
            "Transfers don't need an entity - they move money between accounts"}
          {transactionType === "income" && "Income transactions: salary, interest, refunds, etc."}
          {transactionType === "purchase" && "Purchases require an entity (merchant/payee)"}
        </p>
      </div>

      {/* Form fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Input
            id="description"
            autoFocus
            value={editedFields.description || ""}
            onChange={(e) => setEditedFields({ ...editedFields, description: e.target.value })}
            className="bg-white dark:bg-gray-800"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="amount">Amount</Label>
          <Input
            id="amount"
            type="number"
            step="0.01"
            value={editedFields.amount || 0}
            onChange={(e) =>
              setEditedFields({
                ...editedFields,
                amount: parseFloat(e.target.value),
              })
            }
            className="bg-white dark:bg-gray-800"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="date">Date</Label>
          <Input
            id="date"
            type="date"
            value={editedFields.date || ""}
            onChange={(e) => setEditedFields({ ...editedFields, date: e.target.value })}
            className="bg-white dark:bg-gray-800"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="account">Account</Label>
          <Input
            id="account"
            value={editedFields.account || ""}
            onChange={(e) => setEditedFields({ ...editedFields, account: e.target.value })}
            className="bg-white dark:bg-gray-800"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="location">Location</Label>
          <Input
            id="location"
            value={editedFields.location || ""}
            onChange={(e) => setEditedFields({ ...editedFields, location: e.target.value })}
            placeholder="Optional"
            className="bg-white dark:bg-gray-800"
          />
        </div>
      </div>

      {/* Entity selector - only show for purchases */}
      {transactionType === "purchase" && entities && entities.length > 0 && (
        <div className="space-y-2 mb-4">
          <Label htmlFor="entity">Entity (Merchant/Payee)</Label>
          <EntitySelect
            entities={entities}
            value={transaction.entity?.entityId || ""}
            placeholder="Select entity..."
          />
        </div>
      )}

      {transactionType === "transfer" && (
        <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg mb-4 text-sm">
          <p className="text-gray-700 dark:text-gray-300">
            💡 <strong>Transfer transactions</strong> don't require an entity. They represent money
            moving between your accounts (e.g., credit card payments, savings transfers).
          </p>
        </div>
      )}

      {/* Collapsible raw data for reference */}
      <Collapsible open={isRawDataExpanded} onOpenChange={setIsRawDataExpanded}>
        <CollapsibleTrigger className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
          <ChevronRight
            className={`w-4 h-4 transition-transform ${isRawDataExpanded ? "rotate-90" : ""}`}
          />
          <span>View source CSV data</span>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <pre className="text-xs bg-gray-100 dark:bg-gray-900 p-3 rounded-md overflow-x-auto">
            {JSON.stringify(rawData, null, 2)}
          </pre>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
