import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { usePillarMutation, usePillarQuery } from '@pops/pillar-sdk/react';

import {
  DEFAULT_WISHLIST_VALUES,
  WishlistItemSchema,
  type WishlistFormValues,
  type WishlistItem,
} from './types';

interface WishlistListResult {
  data: WishlistItem[];
  pagination: { total: number };
}

interface CreateWishlistInput {
  item: string;
  targetAmount: number | null;
  saved: number | null;
  priority: WishlistFormValues['priority'];
  url: string | null;
  notes: string | null;
}
interface UpdateWishlistInput {
  id: string;
  data: CreateWishlistInput;
}
interface DeleteWishlistInput {
  id: string;
}

interface MutationDeps {
  setIsDialogOpen: (v: boolean) => void;
  setEditingItem: (item: WishlistItem | null) => void;
  setDeletingId: (id: string | null) => void;
}

function useWishlistMutations(deps: MutationDeps) {
  const createMutation = usePillarMutation<CreateWishlistInput, unknown>(
    'finance',
    ['wishlist', 'create'],
    {
      onSuccess: () => {
        toast.success('Item added to wishlist');
        deps.setIsDialogOpen(false);
      },
      onError: (err) => toast.error(err.message),
    }
  );
  const updateMutation = usePillarMutation<UpdateWishlistInput, unknown>(
    'finance',
    ['wishlist', 'update'],
    {
      onSuccess: () => {
        toast.success('Item updated');
        deps.setIsDialogOpen(false);
        deps.setEditingItem(null);
      },
      onError: (err) => toast.error(err.message),
    }
  );
  const deleteMutation = usePillarMutation<DeleteWishlistInput, unknown>(
    'finance',
    ['wishlist', 'delete'],
    {
      onSuccess: () => {
        toast.success('Item removed');
        deps.setDeletingId(null);
      },
      onError: (err) => toast.error(err.message),
    }
  );
  return { createMutation, updateMutation, deleteMutation };
}

interface DialogHandlersDeps {
  form: ReturnType<typeof useForm<WishlistFormValues>>;
  setEditingItem: (item: WishlistItem | null) => void;
  setIsDialogOpen: (v: boolean) => void;
}

function useDialogHandlers(deps: DialogHandlersDeps) {
  const { form, setEditingItem, setIsDialogOpen } = deps;
  const handleAdd = () => {
    setEditingItem(null);
    form.reset(DEFAULT_WISHLIST_VALUES);
    setIsDialogOpen(true);
  };
  const handleEdit = (item: WishlistItem) => {
    setEditingItem(item);
    form.reset({
      item: item.item,
      targetAmount: item.targetAmount,
      saved: item.saved,
      priority: (item.priority as WishlistFormValues['priority']) ?? 'Soon',
      url: item.url ?? '',
      notes: item.notes ?? '',
    });
    setIsDialogOpen(true);
  };
  return { handleAdd, handleEdit };
}

export function useWishlistPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<WishlistItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const query = usePillarQuery<WishlistListResult>('finance', ['wishlist', 'list'], { limit: 100 });
  const { createMutation, updateMutation, deleteMutation } = useWishlistMutations({
    setIsDialogOpen,
    setEditingItem,
    setDeletingId,
  });

  const form = useForm<WishlistFormValues>({
    // Zod 4 implements Standard Schema v1, so we use the generic resolver —
    // the dedicated `zodResolver` overloads are currently broken under Zod 4.
    resolver: standardSchemaResolver(WishlistItemSchema),
    defaultValues: DEFAULT_WISHLIST_VALUES,
  });

  const { handleAdd, handleEdit } = useDialogHandlers({
    form,
    setEditingItem,
    setIsDialogOpen,
  });
  const onSubmit = (values: WishlistFormValues) => {
    // The server rejects empty strings for `url` (must pass `z.string().url()`).
    // Coerce empty strings to `null` so the strict server contract holds without
    // forcing the form input to use a `null`-valued state.
    const payload: CreateWishlistInput = {
      item: values.item,
      targetAmount: values.targetAmount ?? null,
      saved: values.saved ?? null,
      priority: values.priority,
      url: values.url === '' ? null : (values.url ?? null),
      notes: values.notes === '' ? null : (values.notes ?? null),
    };
    if (editingItem) updateMutation.mutate({ id: editingItem.id, data: payload });
    else createMutation.mutate(payload);
  };

  return {
    query,
    form,
    isDialogOpen,
    setIsDialogOpen,
    editingItem,
    deletingId,
    setDeletingId,
    deleteMutation,
    handleAdd,
    handleEdit,
    onSubmit,
    isSubmitting: createMutation.isPending || updateMutation.isPending,
  };
}
