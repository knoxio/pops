/**
 * Mutations used by the Aliases tab (PRD-122-C).
 *
 * Each tRPC mutation lands its `onSuccess`/`onError` here so the consumer
 * can wire per-mutation reactions (close a dialog, clear selection)
 * without re-implementing toast + invalidation. The opts struct mirrors
 * the mutation surface; callers pass only the hooks they need.
 *
 * Per Copilot review on PR #2724 — dialogs must close from the success
 * path of their mutation, not inline at submit time, otherwise a failed
 * server call would still close the dialog and the user would lose their
 * input.
 */
import { useCallback } from 'react';
import { toast } from 'sonner';

import { usePillarMutation, usePillarUtils } from '@pops/pillar-sdk/react';

import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@pops/api';

import type { AliasSource, AliasTarget } from './types.js';

type CreateInput = inferRouterInputs<AppRouter>['food']['aliases']['create'];
type CreateOutput = inferRouterOutputs<AppRouter>['food']['aliases']['create'];
type UpdateTextInput = inferRouterInputs<AppRouter>['food']['aliases']['updateText'];
type UpdateTextOutput = inferRouterOutputs<AppRouter>['food']['aliases']['updateText'];
type DeleteInput = inferRouterInputs<AppRouter>['food']['aliases']['delete'];
type DeleteOutput = inferRouterOutputs<AppRouter>['food']['aliases']['delete'];
type MergeInput = inferRouterInputs<AppRouter>['food']['aliases']['merge'];
type MergeOutput = inferRouterOutputs<AppRouter>['food']['aliases']['merge'];
type BulkApproveInput = inferRouterInputs<AppRouter>['food']['aliases']['bulkApprove'];
type BulkApproveOutput = inferRouterOutputs<AppRouter>['food']['aliases']['bulkApprove'];

function targetWire(target: AliasTarget): { kind: 'ingredient' | 'variant'; id: number } {
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

function showError(err: { message: string }): void {
  toast.error(err.message);
}

function useRawMutations(baseSuccess: (extra?: () => void) => void, opts: UseAliasMutationsOpts) {
  const { onCreateSuccess, onMergeSuccess } = opts;
  return {
    create: usePillarMutation<CreateInput, CreateOutput>('food', ['aliases', 'create'], {
      onSuccess: () => baseSuccess(onCreateSuccess),
      onError: showError,
    }),
    updateText: usePillarMutation<UpdateTextInput, UpdateTextOutput>(
      'food',
      ['aliases', 'updateText'],
      {
        onSuccess: () => baseSuccess(),
        onError: showError,
      }
    ),
    delete: usePillarMutation<DeleteInput, DeleteOutput>('food', ['aliases', 'delete'], {
      onSuccess: () => baseSuccess(),
      onError: showError,
    }),
    merge: usePillarMutation<MergeInput, MergeOutput>('food', ['aliases', 'merge'], {
      onSuccess: () => baseSuccess(onMergeSuccess),
      onError: showError,
    }),
    bulkApprove: usePillarMutation<BulkApproveInput, BulkApproveOutput>(
      'food',
      ['aliases', 'bulkApprove'],
      {
        onSuccess: () => baseSuccess(),
        onError: showError,
      }
    ),
  };
}

export function useAliasMutations(opts: UseAliasMutationsOpts = {}) {
  const utils = usePillarUtils('food');
  const { onAnySuccess } = opts;

  const invalidateList = useCallback(async () => {
    await utils.invalidate(['aliases', 'listWithTargets']);
    await utils.invalidate(['aliases', 'list']);
  }, [utils]);

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
