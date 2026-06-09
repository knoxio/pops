/**
 * Mutations used by the Aliases tab (PRD-122-C).
 *
 * One hook per mutation surface (create / updateText / delete / merge /
 * bulkApprove) so the consumer destructures only what it needs. Each
 * mutation invalidates the list query so the table refetches once the
 * server confirms.
 *
 * Server errors are forwarded as toasts; the caller can still react via
 * the returned mutation handle (`isPending`, etc.).
 */
import { useCallback } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import type { AliasSource, AliasTarget } from './types';

function targetWire(target: AliasTarget): { kind: 'ingredient' | 'variant'; id: number } {
  return { kind: target.kind, id: target.id };
}

function makeMutationOpts(invalidateList: () => Promise<void>) {
  return {
    onSuccess: () => void invalidateList(),
    onError: (err: { message: string }) => toast.error(err.message),
  };
}

export function useAliasMutations(opts: { onMutationDone?: () => void } = {}) {
  const utils = trpc.useUtils();
  const onDone = opts.onMutationDone;

  const invalidateList = useCallback(async () => {
    await utils.food.aliases.listWithTargets.invalidate();
    await utils.food.aliases.list.invalidate();
    onDone?.();
  }, [onDone, utils.food.aliases.list, utils.food.aliases.listWithTargets]);

  const createMutation = trpc.food.aliases.create.useMutation(makeMutationOpts(invalidateList));
  const updateTextMutation = trpc.food.aliases.updateText.useMutation(
    makeMutationOpts(invalidateList)
  );
  const deleteMutation = trpc.food.aliases.delete.useMutation(makeMutationOpts(invalidateList));
  const mergeMutation = trpc.food.aliases.merge.useMutation(makeMutationOpts(invalidateList));
  const bulkApproveMutation = trpc.food.aliases.bulkApprove.useMutation(
    makeMutationOpts(invalidateList)
  );

  const createAlias = useCallback(
    (input: { alias: string; target: AliasTarget; source?: AliasSource }) =>
      createMutation.mutate({
        alias: input.alias,
        target: targetWire(input.target),
        source: input.source,
      }),
    [createMutation]
  );

  const updateAliasText = useCallback(
    (id: number, alias: string) => updateTextMutation.mutate({ id, alias }),
    [updateTextMutation]
  );

  const deleteAlias = useCallback((id: number) => deleteMutation.mutate({ id }), [deleteMutation]);

  const mergeAliases = useCallback(
    (input: { aliasIds: number[]; target: AliasTarget }) =>
      mergeMutation.mutate({ aliasIds: input.aliasIds, target: targetWire(input.target) }),
    [mergeMutation]
  );

  const bulkApprove = useCallback(
    (aliasIds: number[]) => bulkApproveMutation.mutate({ aliasIds }),
    [bulkApproveMutation]
  );

  return {
    createAlias,
    updateAliasText,
    deleteAlias,
    mergeAliases,
    bulkApprove,
    isCreating: createMutation.isPending,
    isUpdating: updateTextMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isMerging: mergeMutation.isPending,
    isBulkApproving: bulkApproveMutation.isPending,
  };
}
