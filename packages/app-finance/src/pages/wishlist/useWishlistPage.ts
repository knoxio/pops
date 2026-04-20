import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import {
  DEFAULT_WISHLIST_VALUES,
  WishlistItemSchema,
  type WishlistFormValues,
  type WishlistItem,
} from './types';

interface MutationDeps {
  setIsDialogOpen: (v: boolean) => void;
  setEditingItem: (item: WishlistItem | null) => void;
  setDeletingId: (id: string | null) => void;
}

function useWishlistMutations(deps: MutationDeps) {
  const utils = trpc.useUtils();
  const createMutation = trpc.finance.wishlist.create.useMutation({
    onSuccess: () => {
      toast.success('Item added to wishlist');
      utils.finance.wishlist.list.invalidate();
      deps.setIsDialogOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });
  const updateMutation = trpc.finance.wishlist.update.useMutation({
    onSuccess: () => {
      toast.success('Item updated');
      utils.finance.wishlist.list.invalidate();
      deps.setIsDialogOpen(false);
      deps.setEditingItem(null);
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.finance.wishlist.delete.useMutation({
    onSuccess: () => {
      toast.success('Item removed');
      utils.finance.wishlist.list.invalidate();
      deps.setDeletingId(null);
    },
    onError: (err) => toast.error(err.message),
  });
  return { createMutation, updateMutation, deleteMutation };
}

export function useWishlistPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<WishlistItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const query = trpc.finance.wishlist.list.useQuery({ limit: 100 });
  const { createMutation, updateMutation, deleteMutation } = useWishlistMutations({
    setIsDialogOpen,
    setEditingItem,
    setDeletingId,
  });

  const form = useForm<WishlistFormValues>({
    resolver: zodResolver(WishlistItemSchema),
    defaultValues: DEFAULT_WISHLIST_VALUES,
  });

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
      priority: (item.priority as WishlistFormValues['priority']) || 'Soon',
      url: item.url || '',
      notes: item.notes || '',
    });
    setIsDialogOpen(true);
  };
  const onSubmit = (values: WishlistFormValues) => {
    if (editingItem) updateMutation.mutate({ id: editingItem.id, data: values });
    else createMutation.mutate(values);
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
