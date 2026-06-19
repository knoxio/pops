import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { unwrap as unwrapCore } from '../../../core-api-helpers.js';
import { entitiesList } from '../../../core-api/index.js';
import { unwrap } from '../../../finance-api-helpers.js';
import { correctionsCreateOrUpdate, correctionsUpdate } from '../../../finance-api/index.js';
import { DEFAULT_RULE_FORM_VALUES, type RuleFormValues, RuleFormSchema } from './types';

import type { Correction, MatchType } from '../types';

interface UseRuleFormStateOptions {
  onClose: () => void;
}

const ENTITIES_LIST_INPUT = { limit: 500 } as const;

interface CreateRulePayload {
  descriptionPattern: string;
  matchType: MatchType;
  entityId: string | null;
  tags: string[];
  priority: number;
}

interface UpdateRulePayload {
  descriptionPattern: string;
  matchType: MatchType;
  entityId: string | null;
  tags: string[];
  priority: number;
  isActive: boolean;
}

interface UpdateRuleInput {
  id: string;
  data: UpdateRulePayload;
}

function useRuleMutations(onClose: () => void) {
  const queryClient = useQueryClient();
  const createMutation = useMutation({
    mutationFn: async (vars: CreateRulePayload) =>
      unwrap(await correctionsCreateOrUpdate({ body: vars })),
    onSuccess: () => {
      toast.success('Rule saved');
      void queryClient.invalidateQueries({ queryKey: ['finance', 'corrections', 'list'] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });
  const updateMutation = useMutation({
    mutationFn: async (vars: UpdateRuleInput) =>
      unwrap(await correctionsUpdate({ path: { id: vars.id }, body: vars.data })),
    onSuccess: () => {
      toast.success('Rule updated');
      void queryClient.invalidateQueries({ queryKey: ['finance', 'corrections', 'list'] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });
  return { createMutation, updateMutation };
}

function buildSubmit(
  editingRule: Correction | null,
  createMutation: ReturnType<typeof useRuleMutations>['createMutation'],
  updateMutation: ReturnType<typeof useRuleMutations>['updateMutation']
) {
  return (values: RuleFormValues) => {
    if (editingRule) {
      updateMutation.mutate({
        id: editingRule.id,
        data: {
          descriptionPattern: values.descriptionPattern,
          matchType: values.matchType,
          entityId: values.entityId ?? null,
          tags: values.tags,
          priority: values.priority,
          isActive: values.isActive,
        },
      });
      return;
    }
    createMutation.mutate({
      descriptionPattern: values.descriptionPattern,
      matchType: values.matchType,
      entityId: values.entityId ?? null,
      tags: values.tags,
      priority: values.priority,
    });
  };
}

/**
 * Hook owning the manual rule create/edit dialog form state (#2187).
 *
 * Mirrors `useEntitiesPage`:
 *   - `useForm` + `zodResolver` + `DEFAULT_RULE_FORM_VALUES`
 *   - `form.reset(...)` on edit so prefilled values land in `register`d
 *     inputs (the #2155 TextInput safety pattern relies on uncontrolled
 *     inputs whose value is rewritten via the ref).
 *   - boolean `isActive` is managed via Controller in the dialog (#2175).
 *
 * The dialog supports both create and edit, backed by the finance REST
 * `corrections.createOrUpdate` / `corrections.update` operations; the entity
 * picker reads the core `entities.list` over the generated core REST client.
 * Per PRD-244 Option A, `isSubmitting` aggregates the two mutation `isPending`
 * flags by hand.
 */
export function useRuleFormState({ onClose }: UseRuleFormStateOptions) {
  const [editingRule, setEditingRule] = useState<Correction | null>(null);
  const form = useForm<RuleFormValues>({
    // Zod 4 implements Standard Schema v1, so we use the generic
    // standard-schema resolver — the dedicated `zodResolver` overloads are
    // currently broken under Zod 4 (typeName/_def shape mismatch).
    resolver: standardSchemaResolver(RuleFormSchema),
    defaultValues: DEFAULT_RULE_FORM_VALUES,
  });
  const { createMutation, updateMutation } = useRuleMutations(onClose);
  const entitiesQuery = useQuery({
    queryKey: ['core', 'entities', 'list', ENTITIES_LIST_INPUT],
    queryFn: async () => unwrapCore(await entitiesList({ query: ENTITIES_LIST_INPUT })),
  });
  const entities = (entitiesQuery.data?.data ?? []).map((e) => ({ id: e.id, name: e.name }));

  const handleAdd = useCallback(() => {
    setEditingRule(null);
    form.reset(DEFAULT_RULE_FORM_VALUES);
  }, [form]);

  const handleEdit = useCallback(
    (rule: Correction) => {
      setEditingRule(rule);
      form.reset({
        descriptionPattern: rule.descriptionPattern,
        matchType: rule.matchType,
        entityId: rule.entityId ?? null,
        tags: rule.tags,
        priority: rule.priority,
        isActive: rule.isActive,
      });
    },
    [form]
  );

  return {
    form,
    editingRule,
    entities,
    handleAdd,
    handleEdit,
    onSubmit: buildSubmit(editingRule, createMutation, updateMutation),
    isSubmitting: createMutation.isPending || updateMutation.isPending,
  };
}
