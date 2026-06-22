import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { unwrap } from '../../contacts-api-helpers.js';
import { entitiesCreate, entitiesDelete, entitiesUpdate } from '../../contacts-api/index.js';
import { unwrap as unwrapFinance } from '../../finance-api-helpers.js';
import { entityUsageList } from '../../finance-api/index.js';
import {
  DEFAULT_FORM_VALUES,
  type Entity,
  type EntityFormValues,
  EntityFormSchema,
  type ENTITY_TYPES,
} from './types';

import type { EntitiesCreateData } from '../../contacts-api/types.gen.js';

type CreateEntityInput = NonNullable<EntitiesCreateData['body']>;

interface UpdateEntityInput {
  id: string;
  data: CreateEntityInput;
}

interface DeleteEntityInput {
  id: string;
}

/** Query key for the entity list (usage-augmented, finance-served). */
const ENTITIES_KEY = ['contacts', 'entities'] as const;

interface MutationDeps {
  setIsDialogOpen: (v: boolean) => void;
  setEditingEntity: (e: Entity | null) => void;
  setDeletingId: (id: string | null) => void;
}

function useEntityMutations(deps: MutationDeps) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ENTITIES_KEY });

  const createMutation = useMutation({
    mutationFn: async (input: CreateEntityInput) => unwrap(await entitiesCreate({ body: input })),
    onSuccess: () => {
      toast.success('Entity created');
      deps.setIsDialogOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: invalidate,
  });
  const updateMutation = useMutation({
    mutationFn: async (input: UpdateEntityInput) =>
      unwrap(await entitiesUpdate({ path: { id: input.id }, body: input.data })),
    onSuccess: () => {
      toast.success('Entity updated');
      deps.setIsDialogOpen(false);
      deps.setEditingEntity(null);
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: async (input: DeleteEntityInput) =>
      unwrap(await entitiesDelete({ path: { id: input.id } })),
    onSuccess: () => {
      toast.success('Entity deleted');
      deps.setDeletingId(null);
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: invalidate,
  });
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

  // The list (with per-entity transactionCount + the orphaned filter) is the
  // finance-owned usage rollup; contacts' plain entities CRUD carries neither.
  const listQuery = { limit: 100, orphanedOnly: showOrphanedOnly ? 'true' : undefined } as const;
  const query = useQuery({
    queryKey: [...ENTITIES_KEY, 'list', listQuery],
    queryFn: async () => unwrapFinance(await entityUsageList({ query: listQuery })),
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
