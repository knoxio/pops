import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { unwrap } from '../../finance-api-helpers.js';
import {
  budgetsCreate,
  budgetsDelete,
  budgetsList,
  budgetsUpdate,
} from '../../finance-api/index.js';
import { type Budget, BudgetFormSchema, type BudgetFormValues, DEFAULT_FORM_VALUES } from './types';

import type { BudgetsCreateData } from '../../finance-api/types.gen.js';

const BUDGETS_LIST_INPUT = { limit: 100 } as const;

type CreateBudgetInput = NonNullable<BudgetsCreateData['body']>;
interface UpdateBudgetInput {
  id: string;
  data: CreateBudgetInput;
}
interface DeleteBudgetInput {
  id: string;
}

interface UseBudgetMutationsArgs {
  setIsDialogOpen: (v: boolean) => void;
  setEditingBudget: (b: Budget | null) => void;
  setDeletingId: (id: string | null) => void;
}

function useBudgetMutations(args: UseBudgetMutationsArgs) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['finance', 'budgets'] });

  const createMutation = useMutation({
    mutationFn: async (input: CreateBudgetInput) => unwrap(await budgetsCreate({ body: input })),
    onSuccess: () => {
      toast.success('Budget created');
      args.setIsDialogOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: invalidate,
  });
  const updateMutation = useMutation({
    mutationFn: async (input: UpdateBudgetInput) =>
      unwrap(await budgetsUpdate({ path: { id: input.id }, body: input.data })),
    onSuccess: () => {
      toast.success('Budget updated');
      args.setIsDialogOpen(false);
      args.setEditingBudget(null);
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: async (input: DeleteBudgetInput) =>
      unwrap(await budgetsDelete({ path: { id: input.id } })),
    onSuccess: () => {
      toast.success('Budget deleted');
      args.setDeletingId(null);
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: invalidate,
  });
  return { createMutation, updateMutation, deleteMutation };
}

function buildSubmitHandler(
  editingBudget: Budget | null,
  createMutation: ReturnType<typeof useBudgetMutations>['createMutation'],
  updateMutation: ReturnType<typeof useBudgetMutations>['updateMutation']
) {
  return (values: BudgetFormValues) => {
    const payload: CreateBudgetInput = {
      category: values.category,
      period: values.period === '' ? undefined : values.period,
      amount: values.amount ? Number(values.amount) : null,
      active: values.active,
      notes: values.notes || null,
    };
    if (editingBudget) updateMutation.mutate({ id: editingBudget.id, data: payload });
    else createMutation.mutate(payload);
  };
}

export function useBudgetsPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['finance', 'budgets', 'list', BUDGETS_LIST_INPUT],
    queryFn: async () => unwrap(await budgetsList({ query: BUDGETS_LIST_INPUT })),
  });
  const { createMutation, updateMutation, deleteMutation } = useBudgetMutations({
    setIsDialogOpen,
    setEditingBudget,
    setDeletingId,
  });

  const form = useForm<BudgetFormValues>({
    resolver: standardSchemaResolver(BudgetFormSchema),
    defaultValues: DEFAULT_FORM_VALUES,
  });

  const handleAdd = () => {
    setEditingBudget(null);
    form.reset(DEFAULT_FORM_VALUES);
    setIsDialogOpen(true);
  };
  const handleEdit = (budget: Budget) => {
    setEditingBudget(budget);
    form.reset({
      category: budget.category,
      period: budget.period === 'Monthly' || budget.period === 'Yearly' ? budget.period : '',
      amount: budget.amount !== null ? String(budget.amount) : '',
      active: budget.active,
      notes: budget.notes ?? '',
    });
    setIsDialogOpen(true);
  };

  return {
    query,
    form,
    isDialogOpen,
    setIsDialogOpen,
    editingBudget,
    deletingId,
    setDeletingId,
    deleteMutation,
    handleAdd,
    handleEdit,
    onSubmit: buildSubmitHandler(editingBudget, createMutation, updateMutation),
    isSubmitting: createMutation.isPending || updateMutation.isPending,
  };
}
