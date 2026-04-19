/**
 * Entities page - manage merchants/payees with CRUD
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { trpc } from '@pops/api-client';
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
  ChipInput,
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

import type { ColumnFilter } from '@pops/ui';

interface Entity {
  id: string;
  name: string;
  type: string | null;
  abn: string | null;
  aliases: string[];
  defaultTransactionType: string | null;
  defaultTags: string[];
  notes: string | null;
  lastEditedTime: string;
  transactionCount?: number;
}

const ENTITY_TYPES = ['company', 'person', 'place', 'brand', 'organisation'] as const;

const TRANSACTION_TYPES = [
  { label: 'None', value: '' },
  { label: 'Purchase', value: 'purchase' },
  { label: 'Transfer', value: 'transfer' },
  { label: 'Income', value: 'income' },
];

const EntityFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.string(),
  abn: z.string(),
  aliases: z.array(z.string()),
  defaultTransactionType: z.string(),
  defaultTags: z.array(z.string()),
  notes: z.string(),
});

type EntityFormValues = z.infer<typeof EntityFormSchema>;

const DEFAULT_FORM_VALUES: EntityFormValues = {
  name: '',
  type: 'company',
  abn: '',
  aliases: [],
  defaultTransactionType: '',
  defaultTags: [],
  notes: '',
};

export function EntitiesPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<Entity | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showOrphanedOnly, setShowOrphanedOnly] = useState(false);

  const utils = trpc.useUtils();
  const { data, isLoading, error, refetch } = trpc.core.entities.list.useQuery({
    limit: 100,
    orphanedOnly: showOrphanedOnly || undefined,
  });

  const createMutation = trpc.core.entities.create.useMutation({
    onSuccess: () => {
      toast.success('Entity created');
      utils.core.entities.list.invalidate();
      setIsDialogOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.core.entities.update.useMutation({
    onSuccess: () => {
      toast.success('Entity updated');
      utils.core.entities.list.invalidate();
      setIsDialogOpen(false);
      setEditingEntity(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.core.entities.delete.useMutation({
    onSuccess: () => {
      toast.success('Entity deleted');
      utils.core.entities.list.invalidate();
      setDeletingId(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const form = useForm<EntityFormValues>({
    resolver: zodResolver(EntityFormSchema),
    defaultValues: DEFAULT_FORM_VALUES,
  });

  const handleAdd = () => {
    setEditingEntity(null);
    form.reset(DEFAULT_FORM_VALUES);
    setIsDialogOpen(true);
  };

  const handleEdit = (entity: Entity) => {
    setEditingEntity(entity);
    form.reset({
      name: entity.name,
      type: entity.type || 'company',
      abn: entity.abn || '',
      aliases: entity.aliases,
      defaultTransactionType: entity.defaultTransactionType || '',
      defaultTags: entity.defaultTags,
      notes: entity.notes || '',
    });
    setIsDialogOpen(true);
  };

  const onSubmit = (values: EntityFormValues) => {
    const payload = {
      name: values.name,
      type: values.type as (typeof ENTITY_TYPES)[number],
      abn: values.abn || null,
      aliases: values.aliases,
      defaultTransactionType: values.defaultTransactionType || null,
      defaultTags: values.defaultTags,
      notes: values.notes || null,
    };

    if (editingEntity) {
      updateMutation.mutate({ id: editingEntity.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const columns: ColumnDef<Entity>[] = [
    {
      accessorKey: 'name',
      header: ({ column }) => <SortableHeader column={column}>Name</SortableHeader>,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.original.name}</span>
          {row.original.transactionCount === 0 && (
            <Badge
              variant="outline"
              className="text-xs text-muted-foreground border-muted-foreground/30"
            >
              Orphaned
            </Badge>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'type',
      header: 'Type',
      cell: ({ row }) => {
        const type = row.original.type;
        if (!type) {
          return <span className="text-muted-foreground">—</span>;
        }
        return (
          <Badge variant="outline" className="text-xs capitalize">
            {type}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'abn',
      header: 'ABN',
      cell: ({ row }) => (
        <span className="text-sm font-mono">
          {row.original.abn || <span className="text-muted-foreground">—</span>}
        </span>
      ),
    },
    {
      accessorKey: 'aliases',
      header: 'Aliases',
      cell: ({ row }) => {
        const aliases = row.original.aliases;
        if (!aliases || aliases.length === 0) {
          return <span className="text-muted-foreground">—</span>;
        }
        return (
          <div className="flex flex-wrap gap-1">
            {aliases.slice(0, 2).map((alias) => (
              <Badge key={alias} variant="secondary" className="text-xs">
                {alias}
              </Badge>
            ))}
            {aliases.length > 2 && (
              <Badge variant="secondary" className="text-xs">
                +{aliases.length - 2}
              </Badge>
            )}
          </div>
        );
      },
      filterFn: (row, columnId, filterValue) => {
        const searchTerm = String(filterValue ?? '')
          .toLowerCase()
          .trim();
        if (!searchTerm) {
          return true;
        }
        const aliases = row.getValue<string[]>(columnId);
        if (!aliases || aliases.length === 0) return false;
        return aliases.some((alias) => alias.toLowerCase().includes(searchTerm));
      },
    },
    {
      accessorKey: 'defaultTransactionType',
      header: 'Default Type',
      cell: ({ row }) => {
        const defaultType = row.original.defaultTransactionType;
        if (!defaultType) {
          return <span className="text-muted-foreground">—</span>;
        }
        return (
          <Badge variant="outline" className="text-xs">
            {defaultType}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'defaultTags',
      header: 'Default Tags',
      cell: ({ row }) => {
        const tags = row.original.defaultTags;
        if (tags.length === 0) {
          return <span className="text-muted-foreground">—</span>;
        }
        return (
          <div className="flex flex-wrap gap-1">
            {tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
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
              <Button variant="ghost" size="icon" aria-label="Actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            }
            align="end"
          >
            <DropdownMenuItem
              onClick={() => {
                handleEdit(row.original);
              }}
            >
              <Pencil className="mr-2 h-4 w-4" /> Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => {
                setDeletingId(row.original.id);
              }}
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
      id: 'type',
      type: 'select',
      label: 'Type',
      options: [
        { label: 'All Types', value: '' },
        ...ENTITY_TYPES.map((t) => ({ label: t.charAt(0).toUpperCase() + t.slice(1), value: t })),
      ],
    },
  ];

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Entities" />
        <Alert variant="destructive">
          <p className="font-semibold">Failed to load entities</p>
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
        title="Entities"
        description={(() => {
          if (!data) return 'Manage merchants and payees';
          if (showOrphanedOnly) return `${data.pagination.total} orphaned entities`;
          return `${data.pagination.total} total entities`;
        })()}
        actions={
          <Button onClick={handleAdd}>
            <Plus className="mr-2 h-4 w-4" /> Add Entity
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Button
              variant={showOrphanedOnly ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setShowOrphanedOnly((prev) => !prev);
              }}
            >
              {showOrphanedOnly ? 'Showing orphaned only' : 'Show orphaned only'}
            </Button>
          </div>
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            searchable
            searchColumn="name"
            searchPlaceholder="Search entities..."
            paginated
            defaultPageSize={50}
            pageSizeOptions={[25, 50, 100]}
            filters={tableFilters}
          />
        </>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => !isSubmitting && setIsDialogOpen(open)}>
        <DialogContent className="sm:max-w-125">
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>{editingEntity ? 'Edit Entity' : 'New Entity'}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <TextInput
                label="Name"
                placeholder="e.g. Woolworths, Netflix"
                {...form.register('name')}
                error={form.formState.errors.name?.message}
              />
              <div className="grid grid-cols-2 gap-4">
                <Select
                  label="Type"
                  options={ENTITY_TYPES.map((t) => ({
                    label: t.charAt(0).toUpperCase() + t.slice(1),
                    value: t,
                  }))}
                  {...form.register('type')}
                />
                <TextInput
                  label="ABN (Optional)"
                  placeholder="00 000 000 000"
                  {...form.register('abn')}
                />
              </div>
              <div className="space-y-2">
                <Label>Aliases</Label>
                <Controller
                  control={form.control}
                  name="aliases"
                  render={({ field }) => (
                    <ChipInput
                      placeholder="Type and press Enter..."
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
              </div>
              <Select
                label="Default Transaction Type (Optional)"
                options={TRANSACTION_TYPES}
                {...form.register('defaultTransactionType')}
              />
              <div className="space-y-2">
                <Label>Default Tags</Label>
                <Controller
                  control={form.control}
                  name="defaultTags"
                  render={({ field }) => (
                    <ChipInput
                      placeholder="Type and press Enter..."
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label>Notes (Optional)</Label>
                <Textarea placeholder="Additional details..." {...form.register('notes')} />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsDialogOpen(false);
                }}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingEntity ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deletingId}
        onOpenChange={() => {
          setDeletingId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this entity. Transactions referencing it will retain the
              entity name but lose the link.
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
