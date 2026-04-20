import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import {
  DEFAULT_FORM_VALUES,
  type Entity,
  type EntityFormValues,
  EntityFormSchema,
  type ENTITY_TYPES,
} from './types';

interface MutationDeps {
  setIsDialogOpen: (v: boolean) => void;
  setEditingEntity: (e: Entity | null) => void;
  setDeletingId: (id: string | null) => void;
}

function useEntityMutations(deps: MutationDeps) {
  const utils = trpc.useUtils();
  const createMutation = trpc.core.entities.create.useMutation({
    onSuccess: () => {
      toast.success('Entity created');
      utils.core.entities.list.invalidate();
      deps.setIsDialogOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });
  const updateMutation = trpc.core.entities.update.useMutation({
    onSuccess: () => {
      toast.success('Entity updated');
      utils.core.entities.list.invalidate();
      deps.setIsDialogOpen(false);
      deps.setEditingEntity(null);
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.core.entities.delete.useMutation({
    onSuccess: () => {
      toast.success('Entity deleted');
      utils.core.entities.list.invalidate();
      deps.setDeletingId(null);
    },
    onError: (err) => toast.error(err.message),
  });
  return { createMutation, updateMutation, deleteMutation };
}

function buildSubmit(
  editingEntity: Entity | null,
  createMutation: ReturnType<typeof useEntityMutations>['createMutation'],
  updateMutation: ReturnType<typeof useEntityMutations>['updateMutation']
) {
  return (values: EntityFormValues) => {
    const payload = {
      name: values.name,
      type: values.type as (typeof ENTITY_TYPES)[number],
      abn: values.abn || null,
      aliases: values.aliases,
      defaultTransactionType: values.defaultTransactionType || null,
      defaultTags: values.defaultTags,
      notes: values.notes || null,
    };
    if (editingEntity) updateMutation.mutate({ id: editingEntity.id, data: payload });
    else createMutation.mutate(payload);
  };
}

export function useEntitiesPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<Entity | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showOrphanedOnly, setShowOrphanedOnly] = useState(false);

  const query = trpc.core.entities.list.useQuery({
    limit: 100,
    orphanedOnly: showOrphanedOnly || undefined,
  });
  const { createMutation, updateMutation, deleteMutation } = useEntityMutations({
    setIsDialogOpen,
    setEditingEntity,
    setDeletingId,
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

  return {
    query,
    form,
    isDialogOpen,
    setIsDialogOpen,
    editingEntity,
    deletingId,
    setDeletingId,
    showOrphanedOnly,
    setShowOrphanedOnly,
    deleteMutation,
    handleAdd,
    handleEdit,
    onSubmit: buildSubmit(editingEntity, createMutation, updateMutation),
    isSubmitting: createMutation.isPending || updateMutation.isPending,
  };
}
