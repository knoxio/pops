import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';

import { usePillarQuery } from '@pops/pillar-sdk/react';

import {
  DEFAULT_TRANSACTION_VALUES,
  type Transaction,
  type TransactionFormValues,
  TransactionFormSchema,
} from './types';
import { useTransactionMutations } from './useTransactionMutations';

import type { Transaction as ApiTransaction } from '@pops/api/modules/finance/transactions/types';

interface TransactionsListResult {
  data: ApiTransaction[];
  pagination: { total: number };
}

interface EntityRef {
  id: string;
  name: string;
  type: string;
}

interface EntitiesListResult {
  data: EntityRef[];
  pagination: { total: number };
}

/**
 * Build the API payload from the form values.
 *
 * - amount: parsed via Number() — schema already validates finiteness
 * - entityId: '' → null (free-form selection cleared)
 * - entityName: looked up from the entities list when an id is selected
 * - notes: '' → null (server contract is `string | null`)
 */
export interface BuildPayloadArgs {
  values: TransactionFormValues;
  entityName: string | null;
}

export function buildTransactionPayload({ values, entityName }: BuildPayloadArgs) {
  const entityId = values.entityId === '' ? null : values.entityId;
  return {
    description: values.description,
    account: values.account,
    amount: Number(values.amount),
    date: values.date,
    type: values.type,
    tags: values.tags,
    entityId,
    entityName: entityId ? entityName : null,
    notes: values.notes === '' ? null : values.notes,
  };
}

interface SubmitDeps {
  editingTransaction: Transaction | null;
  createMutation: ReturnType<typeof useTransactionMutations>['createMutation'];
  updateMutation: ReturnType<typeof useTransactionMutations>['updateMutation'];
  resolveEntityName: (entityId: string) => string | null;
}

function buildSubmit(deps: SubmitDeps) {
  return (values: TransactionFormValues) => {
    const entityName = values.entityId === '' ? null : deps.resolveEntityName(values.entityId);
    const payload = buildTransactionPayload({ values, entityName });
    if (deps.editingTransaction) {
      deps.updateMutation.mutate({ id: deps.editingTransaction.id, data: payload });
    } else {
      deps.createMutation.mutate(payload);
    }
  };
}

/** Map an existing transaction to form values for the edit dialog. */
function transactionToFormValues(t: Transaction): TransactionFormValues {
  return {
    date: t.date,
    amount: String(t.amount),
    description: t.description,
    account: t.account,
    type: t.type || 'Expense',
    entityId: t.entityId ?? '',
    tags: t.tags,
    notes: t.notes ?? '',
  };
}

interface DialogHandlersDeps {
  form: ReturnType<typeof useForm<TransactionFormValues>>;
  setEditingTransaction: (t: Transaction | null) => void;
  setIsDialogOpen: (v: boolean) => void;
}

function useDialogHandlers(deps: DialogHandlersDeps) {
  const { form, setEditingTransaction, setIsDialogOpen } = deps;
  const handleAdd = useCallback(() => {
    setEditingTransaction(null);
    form.reset({
      ...DEFAULT_TRANSACTION_VALUES,
      // Default to today (YYYY-MM-DD slice). Local date so the user sees today.
      date: new Date().toISOString().slice(0, 10),
    });
    setIsDialogOpen(true);
  }, [form, setEditingTransaction, setIsDialogOpen]);

  const handleEdit = useCallback(
    (transaction: Transaction) => {
      setEditingTransaction(transaction);
      form.reset(transactionToFormValues(transaction));
      setIsDialogOpen(true);
    },
    [form, setEditingTransaction, setIsDialogOpen]
  );
  return { handleAdd, handleEdit };
}

function useTransactionsPageQueries() {
  const query = usePillarQuery<TransactionsListResult>('finance', ['transactions', 'list'], {
    limit: 100,
  });
  const { data: availableTagsData } = usePillarQuery<string[]>(
    'finance',
    ['transactions', 'availableTags'],
    undefined
  );
  const entitiesQuery = usePillarQuery<EntitiesListResult>('core', ['entities', 'list'], {
    limit: 500,
  });
  return { query, availableTagsData, entitiesQuery };
}

export function useTransactionsPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [deletingTx, setDeletingTx] = useState<Transaction | null>(null);

  const { query, availableTagsData, entitiesQuery } = useTransactionsPageQueries();

  const { createMutation, updateMutation, deleteMutation, confirmDelete } = useTransactionMutations(
    {
      setIsDialogOpen,
      setEditingTransaction,
      setDeletingTx,
    }
  );

  const form = useForm<TransactionFormValues>({
    resolver: standardSchemaResolver(TransactionFormSchema),
    defaultValues: DEFAULT_TRANSACTION_VALUES,
  });

  const { handleAdd, handleEdit } = useDialogHandlers({
    form,
    setEditingTransaction,
    setIsDialogOpen,
  });

  const resolveEntityName = useCallback(
    (entityId: string): string | null => {
      const entity = entitiesQuery.data?.data.find((e) => e.id === entityId);
      return entity?.name ?? null;
    },
    [entitiesQuery.data]
  );

  const onSubmit = buildSubmit({
    editingTransaction,
    createMutation,
    updateMutation,
    resolveEntityName,
  });

  return {
    query,
    availableTags: availableTagsData ?? [],
    entities: entitiesQuery.data?.data ?? [],
    form,
    isDialogOpen,
    setIsDialogOpen,
    editingTransaction,
    deletingTx,
    setDeletingTx,
    deleteMutation,
    confirmDelete,
    handleAdd,
    handleEdit,
    onSubmit,
    isSubmitting: createMutation.isPending || updateMutation.isPending,
  };
}
