import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import { DEFAULT_RULE_FORM_VALUES, type RuleFormValues, RuleFormSchema } from './types';

import type { Correction } from '../types';

interface UseRuleFormStateOptions {
  onClose: () => void;
}

function useRuleMutations(onClose: () => void) {
  const utils = trpc.useUtils();
  const createMutation = trpc.core.corrections.createOrUpdate.useMutation({
    onSuccess: () => {
      toast.success('Rule saved');
      void utils.core.corrections.list.invalidate();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });
  const updateMutation = trpc.core.corrections.update.useMutation({
    onSuccess: () => {
      toast.success('Rule updated');
      void utils.core.corrections.list.invalidate();
      onClose();
    },
    onError: (err) => toast.error(err.message),
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
 * The dialog supports both:
 *   - Create — `core.corrections.createOrUpdate`
 *   - Edit — `core.corrections.update`
 *
 * Pattern + matchType updates rely on the schema/handler additions in
 * `correction-schemas.ts` and `query-helpers.ts`.
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
  const entitiesQuery = trpc.core.entities.list.useQuery({ limit: 500 });
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
