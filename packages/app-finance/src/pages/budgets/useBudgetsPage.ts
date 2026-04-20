import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import { type Budget, BudgetFormSchema, type BudgetFormValues, DEFAULT_FORM_VALUES } from './types';

interface UseBudgetMutationsArgs {
  setIsDialogOpen: (v: boolean) => void;
  setEditingBudget: (b: Budget | null) => void;
  setDeletingId: (id: string | null) => void;
}

function useBudgetMutations(args: UseBudgetMutationsArgs) {
  const utils = trpc.useUtils();
  const createMutation = trpc.finance.budgets.create.useMutation({
    onSuccess: () => {
      toast.success('Budget created');
      void utils.finance.budgets.list.invalidate();
      args.setIsDialogOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });
  const updateMutation = trpc.finance.budgets.update.useMutation({
    onSuccess: () => {
      toast.success('Budget updated');
      void utils.finance.budgets.list.invalidate();
      args.setIsDialogOpen(false);
      args.setEditingBudget(null);
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.finance.budgets.delete.useMutation({
    onSuccess: () => {
      toast.success('Budget deleted');
      void utils.finance.budgets.list.invalidate();
      args.setDeletingId(null);
    },
    onError: (err) => toast.error(err.message),
  });
  return { createMutation, updateMutation, deleteMutation };
}

function buildSubmitHandler(
  editingBudget: Budget | null,
  createMutation: ReturnType<typeof useBudgetMutations>['createMutation'],
  updateMutation: ReturnType<typeof useBudgetMutations>['updateMutation']
) {
  return (values: BudgetFormValues) => {
    const payload = {
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

  const query = trpc.finance.budgets.list.useQuery({ limit: 100 });
  const { createMutation, updateMutation, deleteMutation } = useBudgetMutations({
    setIsDialogOpen,
    setEditingBudget,
    setDeletingId,
  });

  const form = useForm<BudgetFormValues>({
    resolver: zodResolver(BudgetFormSchema),
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
      period: budget.period ?? '',
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
