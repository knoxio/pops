import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { usePillarMutation, usePillarQuery } from '@pops/pillar-sdk/react';

import { type Budget, BudgetFormSchema, type BudgetFormValues, DEFAULT_FORM_VALUES } from './types';

interface BudgetsListResult {
  data: Budget[];
  pagination: { total: number };
}

interface CreateBudgetInput {
  category: string;
  period: string | null;
  amount: number | null;
  active: boolean;
  notes: string | null;
}
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
  const createMutation = usePillarMutation<CreateBudgetInput, unknown>(
    'finance',
    ['budgets', 'create'],
    {
      onSuccess: () => {
        toast.success('Budget created');
        args.setIsDialogOpen(false);
      },
      onError: (err) => toast.error(err.message),
    }
  );
  const updateMutation = usePillarMutation<UpdateBudgetInput, unknown>(
    'finance',
    ['budgets', 'update'],
    {
      onSuccess: () => {
        toast.success('Budget updated');
        args.setIsDialogOpen(false);
        args.setEditingBudget(null);
      },
      onError: (err) => toast.error(err.message),
    }
  );
  const deleteMutation = usePillarMutation<DeleteBudgetInput, unknown>(
    'finance',
    ['budgets', 'delete'],
    {
      onSuccess: () => {
        toast.success('Budget deleted');
        args.setDeletingId(null);
      },
      onError: (err) => toast.error(err.message),
    }
  );
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
      period: values.period || null,
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

  const query = usePillarQuery<BudgetsListResult>('finance', ['budgets', 'list'], { limit: 100 });
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
