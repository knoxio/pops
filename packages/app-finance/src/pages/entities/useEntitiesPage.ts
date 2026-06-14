import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { usePillarMutation, usePillarQuery, usePillarUtils } from '@pops/pillar-sdk/react';

import {
  DEFAULT_FORM_VALUES,
  type Entity,
  type EntityFormValues,
  EntityFormSchema,
  type ENTITY_TYPES,
} from './types';

interface EntitiesListResult {
  data: Entity[];
  pagination: { total: number };
}

interface CreateEntityInput {
  name: string;
  type: (typeof ENTITY_TYPES)[number];
  abn: string | null;
  aliases: string[];
  defaultTransactionType: string | null;
  defaultTags: string[];
  notes: string | null;
}

interface UpdateEntityInput {
  id: string;
  data: CreateEntityInput;
}

interface DeleteEntityInput {
  id: string;
}

interface MutationDeps {
  setIsDialogOpen: (v: boolean) => void;
  setEditingEntity: (e: Entity | null) => void;
  setDeletingId: (id: string | null) => void;
}

function useEntityMutations(deps: MutationDeps) {
  const utils = usePillarUtils('core');
  const createMutation = usePillarMutation<CreateEntityInput, unknown>(
    'core',
    ['entities', 'create'],
    {
      onSuccess: () => {
        toast.success('Entity created');
        void utils.invalidate(['entities', 'list']);
        deps.setIsDialogOpen(false);
      },
      onError: (err) => toast.error(err.message),
    }
  );
  const updateMutation = usePillarMutation<UpdateEntityInput, unknown>(
    'core',
    ['entities', 'update'],
    {
      onSuccess: () => {
        toast.success('Entity updated');
        void utils.invalidate(['entities', 'list']);
        deps.setIsDialogOpen(false);
        deps.setEditingEntity(null);
      },
      onError: (err) => toast.error(err.message),
    }
  );
  const deleteMutation = usePillarMutation<DeleteEntityInput, unknown>(
    'core',
    ['entities', 'delete'],
    {
      onSuccess: () => {
        toast.success('Entity deleted');
        void utils.invalidate(['entities', 'list']);
        deps.setDeletingId(null);
      },
      onError: (err) => toast.error(err.message),
    }
  );
  return { createMutation, updateMutation, deleteMutation };
}

function buildSubmit(
  editingEntity: Entity | null,
  createMutation: ReturnType<typeof useEntityMutations>['createMutation'],
  updateMutation: ReturnType<typeof useEntityMutations>['updateMutation']
) {
  return (values: EntityFormValues) => {
    const payload: CreateEntityInput = {
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

  const query = usePillarQuery<EntitiesListResult>('core', ['entities', 'list'], {
    limit: 100,
    orphanedOnly: showOrphanedOnly || undefined,
  });
  const { createMutation, updateMutation, deleteMutation } = useEntityMutations({
    setIsDialogOpen,
    setEditingEntity,
    setDeletingId,
  });
  const form = useForm<EntityFormValues>({
    resolver: standardSchemaResolver(EntityFormSchema),
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
      type: entity.type ?? 'company',
      abn: entity.abn ?? '',
      aliases: entity.aliases,
      defaultTransactionType: entity.defaultTransactionType ?? '',
      defaultTags: entity.defaultTags,
      notes: entity.notes ?? '',
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
