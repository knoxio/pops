/**
 * Mutations used by the Aliases tab.
 *
 * Each mutation lands its `onSuccess`/`onError` here so the consumer can
 * wire per-mutation reactions (close a dialog, clear selection) without
 * re-implementing toast + invalidation. The opts struct mirrors the
 * mutation surface; callers pass only the hooks they need.
 *
 * Dialogs must close from the success path of their mutation, not inline
 * at submit time, otherwise a failed server call would still close the
 * dialog and the user would lose their input.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { unwrap } from '../../../food-api-helpers.js';
import {
  aliasesBulkApprove,
  aliasesCreate,
  aliasesDelete,
  aliasesMerge,
  aliasesUpdateText,
} from '../../../food-api/index.js';

import type { AliasSource, AliasTarget } from './types.js';

type AliasTargetWire = { kind: 'ingredient' | 'variant'; id: number };

interface CreateInput {
  alias: string;
  target: AliasTargetWire;
  source?: AliasSource;
}
interface UpdateTextInput {
  id: number;
  alias: string;
}
interface DeleteInput {
  id: number;
}
interface MergeInput {
  aliasIds: number[];
  target: AliasTargetWire;
}
interface BulkApproveInput {
  aliasIds: number[];
}

function targetWire(target: AliasTarget): AliasTargetWire {
  return { kind: target.kind, id: target.id };
}

export interface UseAliasMutationsOpts {
  /** Fired after any mutation lands + the list cache invalidates. */
  readonly onAnySuccess?: () => void;
  /** Fired only after `createAlias` succeeds. Typically closes the Add dialog. */
  readonly onCreateSuccess?: () => void;
  /** Fired only after `mergeAliases` succeeds. Typically closes the Merge dialog. */
  readonly onMergeSuccess?: () => void;
}

function showError(err: Error): void {
  toast.error(err.message);
}

function useRawMutations(baseSuccess: (extra?: () => void) => void, opts: UseAliasMutationsOpts) {
  const { onCreateSuccess, onMergeSuccess } = opts;
  return {
    create: useMutation({
      mutationFn: async (input: CreateInput) =>
        unwrap(
          await aliasesCreate({
            body: { alias: input.alias, source: input.source, target: input.target },
          })
        ),
      onSuccess: () => baseSuccess(onCreateSuccess),
      onError: showError,
    }),
    updateText: useMutation({
      mutationFn: async (input: UpdateTextInput) =>
        unwrap(await aliasesUpdateText({ path: { id: input.id }, body: { alias: input.alias } })),
      onSuccess: () => baseSuccess(),
      onError: showError,
    }),
    delete: useMutation({
      mutationFn: async (input: DeleteInput) =>
        unwrap(await aliasesDelete({ path: { id: input.id } })),
      onSuccess: () => baseSuccess(),
      onError: showError,
    }),
    merge: useMutation({
      mutationFn: async (input: MergeInput) =>
        unwrap(await aliasesMerge({ body: { aliasIds: input.aliasIds, target: input.target } })),
      onSuccess: () => baseSuccess(onMergeSuccess),
      onError: showError,
    }),
    bulkApprove: useMutation({
      mutationFn: async (input: BulkApproveInput) =>
        unwrap(await aliasesBulkApprove({ body: { aliasIds: input.aliasIds } })),
      onSuccess: () => baseSuccess(),
      onError: showError,
    }),
  };
}

export function useAliasMutations(opts: UseAliasMutationsOpts = {}) {
  const qc = useQueryClient();
  const { onAnySuccess } = opts;

  const invalidateList = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ['food', 'aliases', 'listWithTargets'] });
    await qc.invalidateQueries({ queryKey: ['food', 'aliases', 'list'] });
  }, [qc]);

  const baseSuccess = useCallback(
    (extra?: () => void) => {
      void invalidateList().then(() => {
        extra?.();
        onAnySuccess?.();
      });
    },
    [invalidateList, onAnySuccess]
  );

  const raw = useRawMutations(baseSuccess, opts);

  const createAlias = useCallback(
    (input: { alias: string; target: AliasTarget; source?: AliasSource }) =>
      raw.create.mutate({
        alias: input.alias,
        target: targetWire(input.target),
        source: input.source,
      }),
    [raw.create]
  );
  const updateAliasText = useCallback(
    (id: number, alias: string) => raw.updateText.mutate({ id, alias }),
    [raw.updateText]
  );
  const deleteAlias = useCallback((id: number) => raw.delete.mutate({ id }), [raw.delete]);
  const mergeAliases = useCallback(
    (input: { aliasIds: number[]; target: AliasTarget }) =>
      raw.merge.mutate({ aliasIds: input.aliasIds, target: targetWire(input.target) }),
    [raw.merge]
  );
  const bulkApprove = useCallback(
    (aliasIds: number[]) => raw.bulkApprove.mutate({ aliasIds }),
    [raw.bulkApprove]
  );

  return {
    createAlias,
    updateAliasText,
    deleteAlias,
    mergeAliases,
    bulkApprove,
    isCreating: raw.create.isPending,
    isUpdating: raw.updateText.isPending,
    isDeleting: raw.delete.isPending,
    isMerging: raw.merge.isPending,
    isBulkApproving: raw.bulkApprove.isPending,
  };
}
