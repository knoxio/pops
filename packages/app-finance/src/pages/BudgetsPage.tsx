/**
 * Budgets page - manage budgets with CRUD
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { useSetPageContext } from '@pops/navigation';
import type { ColumnFilter } from '@pops/ui';
import {
  Alert,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  CheckboxInput,
  DataTable,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  Label,
  PageHeader,
  Select,
  Skeleton,
  SortableHeader,
  Textarea,
  TextInput,
} from '@pops/ui';
import type { ColumnDef } from '@tanstack/react-table';
import { Loader2, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { trpc } from '../lib/trpc';

interface Budget {
  id: string;
  category: string;
  period: string | null;
  amount: number | null;
  active: boolean;
  notes: string | null;
  lastEditedTime: string;
}

const BudgetFormSchema = z.object({
  category: z.string().min(1, 'Category is required'),
  period: z.string(),
  amount: z.string(),
  active: z.boolean(),
  notes: z.string(),
});

type BudgetFormValues = z.infer<typeof BudgetFormSchema>;

const PERIOD_OPTIONS = [
  { label: 'None (One-time)', value: '' },
  { label: 'Monthly', value: 'Monthly' },
  { label: 'Yearly', value: 'Yearly' },
];

const DEFAULT_FORM_VALUES: BudgetFormValues = {
  category: '',
  period: '',
  amount: '',
  active: false,
  notes: '',
};

export function BudgetsPage() {
  useSetPageContext({ page: 'budgets' });

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const { data, isLoading, error, refetch } = trpc.finance.budgets.list.useQuery({
    limit: 100,
  });

  const createMutation = trpc.finance.budgets.create.useMutation({
    onSuccess: () => {
      toast.success('Budget created');
      utils.finance.budgets.list.invalidate();
      setIsDialogOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.finance.budgets.update.useMutation({
    onSuccess: () => {
      toast.success('Budget updated');
      utils.finance.budgets.list.invalidate();
      setIsDialogOpen(false);
      setEditingBudget(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.finance.budgets.delete.useMutation({
    onSuccess: () => {
      toast.success('Budget deleted');
      utils.finance.budgets.list.invalidate();
      setDeletingId(null);
    },
    onError: (err) => toast.error(err.message),
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
      period: budget.period || '',
      amount: budget.amount !== null ? String(budget.amount) : '',
      active: budget.active,
      notes: budget.notes || '',
    });
    setIsDialogOpen(true);
  };

  const onSubmit = (values: BudgetFormValues) => {
    const payload = {
      category: values.category,
      period: values.period || null,
      amount: values.amount ? Number(values.amount) : null,
      active: values.active,
      notes: values.notes || null,
    };

    if (editingBudget) {
      updateMutation.mutate({ id: editingBudget.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const columns: ColumnDef<Budget>[] = [
    {
      accessorKey: 'category',
      header: ({ column }) => <SortableHeader column={column}>Category</SortableHeader>,
      cell: ({ row }) => <div className="font-medium">{row.original.category}</div>,
    },
    {
      accessorKey: 'period',
      header: 'Period',
      cell: ({ row }) => {
        const period = row.original.period;
        if (!period) return <span className="text-muted-foreground">—</span>;
        return (
          <Badge
            variant="outline"
            className={
              period === 'Monthly'
                ? 'bg-blue-500/10 text-blue-700 border-blue-500/20 dark:text-blue-400'
                : 'bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-400'
            }
          >
            {period}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'amount',
      header: ({ column }) => (
        <div className="flex justify-end">
          <SortableHeader column={column}>Amount</SortableHeader>
        </div>
      ),
      cell: ({ row }) => {
        const amount = row.original.amount;
        if (amount === null) {
          return <div className="text-right text-muted-foreground">—</div>;
        }
        return (
          <div className="text-right font-mono font-medium tabular-nums">${amount.toFixed(2)}</div>
        );
      },
    },
    {
      accessorKey: 'active',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.active ? 'default' : 'secondary'} className="text-xs">
          {row.original.active ? 'Active' : 'Inactive'}
        </Badge>
      ),
      filterFn: (row, columnId, filterValue) => {
        if (filterValue === undefined || filterValue === null || filterValue === '') {
          return true;
        }
        const value = row.getValue<boolean>(columnId);
        const filterBool = filterValue === 'true';
        return value === filterBool;
      },
    },
    {
      accessorKey: 'notes',
      header: 'Notes',
      cell: ({ row }) => {
        const notes = row.original.notes;
        if (!notes) {
          return <span className="text-muted-foreground">—</span>;
        }
        return <div className="max-w-md text-sm truncate text-muted-foreground">{notes}</div>;
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <div className="text-right">
          <DropdownMenu
            trigger={
              <Button variant="ghost" size="icon" className="h-8 w-8 p-0" aria-label="Actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            }
            align="end"
          >
            <DropdownMenuItem onClick={() => handleEdit(row.original)}>
              <Pencil className="mr-2 h-4 w-4" /> Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setDeletingId(row.original.id)}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  const tableFilters: ColumnFilter[] = [
    {
      id: 'period',
      type: 'select',
      label: 'Period',
      options: [
        { label: 'All Periods', value: '' },
        { label: 'Monthly', value: 'Monthly' },
        { label: 'Yearly', value: 'Yearly' },
      ],
    },
    {
      id: 'active',
      type: 'select',
      label: 'Status',
      options: [
        { label: 'All', value: '' },
        { label: 'Active', value: 'true' },
        { label: 'Inactive', value: 'false' },
      ],
    },
  ];

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Budgets" />
        <Alert variant="destructive">
          <p className="font-semibold">Failed to load budgets</p>
          <p className="text-sm">{error.message}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-4">
            Try again
          </Button>
        </Alert>
      </div>
    );
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Budgets"
        description={data ? `${data.pagination.total} total budgets` : 'Manage spending targets'}
        actions={
          <Button onClick={handleAdd}>
            <Plus className="mr-2 h-4 w-4" /> Add Budget
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={data?.data ?? []}
          searchable
          searchColumn="category"
          searchPlaceholder="Search budgets..."
          paginated
          defaultPageSize={50}
          pageSizeOptions={[25, 50, 100]}
          filters={tableFilters}
        />
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => !isSubmitting && setIsDialogOpen(open)}>
        <DialogContent className="sm:max-w-(--size-dialog-sm)">
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>{editingBudget ? 'Edit Budget' : 'New Budget'}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <TextInput
                label="Category"
                placeholder="e.g. Groceries, Entertainment"
                {...form.register('category')}
                error={form.formState.errors.category?.message}
              />
              <Select
                label="Period"
                options={PERIOD_OPTIONS}
                {...form.register('period')}
                error={form.formState.errors.period?.message}
              />
              <TextInput
                type="number"
                label="Amount (Optional)"
                placeholder="0.00"
                prefix="$"
                step="0.01"
                min="0"
                {...form.register('amount')}
                error={form.formState.errors.amount?.message}
              />
              <Controller
                control={form.control}
                name="active"
                render={({ field }) => (
                  <CheckboxInput
                    label="Active"
                    description="Enable this budget for tracking"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
              <div className="space-y-2">
                <Label>Notes (Optional)</Label>
                <Textarea placeholder="Additional details..." {...form.register('notes')} />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingBudget ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this budget. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingId && deleteMutation.mutate({ id: deletingId })}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
