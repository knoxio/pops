/**
 * Wishlist page - savings goals
 */
import { zodResolver } from '@hookform/resolvers/zod';
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
  DataTable,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  Progress,
  Select,
  Skeleton,
  SortableHeader,
  TextInput,
} from '@pops/ui';
import type { ColumnDef } from '@tanstack/react-table';
import { ExternalLink, Loader2, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { trpc } from '../lib/trpc';

// Schema matching the API
const WishlistItemSchema = z.object({
  item: z.string().min(1, 'Item name is required'),
  targetAmount: z.number().nullable().optional(),
  saved: z.number().nullable().optional(),
  priority: z.enum(['Needing', 'Soon', 'One Day', 'Dreaming']).nullable().optional(),
  url: z.string().url('Must be a valid URL').or(z.literal('')).nullable().optional(),
  notes: z.string().nullable().optional(),
});

type WishlistFormValues = z.infer<typeof WishlistItemSchema>;

interface WishlistItem {
  id: string;
  item: string;
  targetAmount: number | null;
  saved: number | null;
  remainingAmount: number | null;
  priority: string | null;
  url: string | null;
  notes: string | null;
  lastEditedTime: string;
}

export function WishlistPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<WishlistItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const { data, isLoading, error, refetch } = trpc.finance.wishlist.list.useQuery({
    limit: 100,
  });

  const createMutation = trpc.finance.wishlist.create.useMutation({
    onSuccess: () => {
      toast.success('Item added to wishlist');
      utils.finance.wishlist.list.invalidate();
      setIsDialogOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.finance.wishlist.update.useMutation({
    onSuccess: () => {
      toast.success('Item updated');
      utils.finance.wishlist.list.invalidate();
      setIsDialogOpen(false);
      setEditingItem(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.finance.wishlist.delete.useMutation({
    onSuccess: () => {
      toast.success('Item removed');
      utils.finance.wishlist.list.invalidate();
      setDeletingId(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const form = useForm<WishlistFormValues>({
    resolver: zodResolver(WishlistItemSchema),
    defaultValues: {
      item: '',
      targetAmount: null,
      saved: null,
      priority: 'Soon',
      url: '',
      notes: '',
    },
  });

  const handleAdd = () => {
    setEditingItem(null);
    form.reset({
      item: '',
      targetAmount: null,
      saved: null,
      priority: 'Soon',
      url: '',
      notes: '',
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (item: WishlistItem) => {
    setEditingItem(item);
    form.reset({
      item: item.item,
      targetAmount: item.targetAmount,
      saved: item.saved,
      priority: (item.priority as WishlistFormValues['priority']) || 'Soon',
      url: item.url || '',
      notes: item.notes || '',
    });
    setIsDialogOpen(true);
  };

  const onSubmit = (values: WishlistFormValues) => {
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: values });
    } else {
      createMutation.mutate(values);
    }
  };

  const columns: ColumnDef<WishlistItem>[] = [
    {
      accessorKey: 'item',
      header: ({ column }) => <SortableHeader column={column}>Item</SortableHeader>,
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.original.item}</span>
          {row.original.url && (
            <a
              href={row.original.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Link <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'priority',
      header: 'Priority',
      cell: ({ row }) => {
        const priority = row.original.priority;
        if (!priority) return <span className="text-muted-foreground">—</span>;
        return (
          <Badge
            variant={
              priority === 'Needing' ? 'default' : priority === 'Soon' ? 'secondary' : 'outline'
            }
          >
            {priority}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'targetAmount',
      header: ({ column }) => (
        <div className="flex justify-end">
          <SortableHeader column={column}>Target</SortableHeader>
        </div>
      ),
      cell: ({ row }) => {
        const amount = row.original.targetAmount;
        if (amount === null) return <div className="text-right text-muted-foreground">—</div>;
        return (
          <div className="text-right font-mono font-medium tabular-nums">
            $
            {amount.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
        );
      },
    },
    {
      accessorKey: 'saved',
      header: ({ column }) => (
        <div className="flex justify-end">
          <SortableHeader column={column}>Saved</SortableHeader>
        </div>
      ),
      cell: ({ row }) => {
        const amount = row.original.saved;
        if (amount === null) return <div className="text-right text-muted-foreground">—</div>;
        return (
          <div className="text-right font-mono font-medium tabular-nums text-app-accent">
            $
            {amount.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
        );
      },
    },
    {
      id: 'progress',
      header: 'Progress',
      cell: ({ row }) => {
        const { targetAmount, saved } = row.original;
        if (targetAmount === null || saved === null || targetAmount === 0) {
          return <span className="text-muted-foreground">—</span>;
        }
        const percentage = Math.min(100, Math.round((saved / targetAmount) * 100));
        return (
          <div className="flex items-center gap-2 min-w-30">
            <Progress value={percentage} className="h-2 flex-1" />
            <span className="text-xs font-medium tabular-nums w-10 text-right">{percentage}%</span>
          </div>
        );
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
      id: 'priority',
      type: 'select',
      label: 'Priority',
      options: [
        { label: 'All Priorities', value: '' },
        { label: 'Needing', value: 'Needing' },
        { label: 'Soon', value: 'Soon' },
        { label: 'One Day', value: 'One Day' },
        { label: 'Dreaming', value: 'Dreaming' },
      ],
    },
  ];

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Wish List</h1>
        <Alert variant="destructive">
          <p className="font-semibold">Failed to load wish list</p>
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Wish List</h1>
          <p className="text-muted-foreground text-sm">
            {data ? `${data.pagination.total} items to save for` : 'Tracking your goals'}
          </p>
        </div>
        <Button onClick={handleAdd}>
          <Plus className="mr-2 h-4 w-4" /> Add Item
        </Button>
      </div>

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
          searchColumn="item"
          searchPlaceholder="Search items..."
          paginated
          defaultPageSize={50}
          filters={tableFilters}
        />
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => !isSubmitting && setIsDialogOpen(open)}>
        <DialogContent className="sm:max-w-(--size-dialog-sm)">
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>{editingItem ? 'Edit Item' : 'New Wishlist Item'}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <TextInput
                  label="Item Name"
                  placeholder="e.g. Mechanical Keyboard"
                  {...form.register('item')}
                  error={form.formState.errors.item?.message}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <TextInput
                  type="number"
                  label="Target Amount"
                  placeholder="0.00"
                  prefix="$"
                  {...form.register('targetAmount', { valueAsNumber: true })}
                  error={form.formState.errors.targetAmount?.message}
                />
                <TextInput
                  type="number"
                  label="Already Saved"
                  placeholder="0.00"
                  prefix="$"
                  {...form.register('saved', { valueAsNumber: true })}
                  error={form.formState.errors.saved?.message}
                />
              </div>
              <div className="space-y-2">
                <Select
                  label="Priority"
                  options={[
                    { label: 'Needing', value: 'Needing' },
                    { label: 'Soon', value: 'Soon' },
                    { label: 'One Day', value: 'One Day' },
                    { label: 'Dreaming', value: 'Dreaming' },
                  ]}
                  {...form.register('priority')}
                  error={form.formState.errors.priority?.message}
                />
              </div>
              <div className="space-y-2">
                <TextInput
                  label="URL (Optional)"
                  placeholder="https://..."
                  {...form.register('url')}
                  error={form.formState.errors.url?.message}
                />
              </div>
              <div className="space-y-2">
                <TextInput
                  label="Notes"
                  placeholder="Why do you want this?"
                  {...form.register('notes')}
                  error={form.formState.errors.notes?.message}
                />
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
                {editingItem ? 'Update' : 'Create'}
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
              This will permanently delete this item from your wish list.
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
