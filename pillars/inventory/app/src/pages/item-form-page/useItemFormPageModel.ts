import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';

import { isNotFoundError, unwrap } from '../../inventory-api-helpers.js';
import { itemsGet, itemsList, locationsCreate, locationsTree } from '../../inventory-api/index.js';
import { itemToFormValues, type ItemQueryResult } from './item-record';
import { defaultValues, type ItemFormValues, type PendingConnection } from './types';
import { useAssetIdValidation } from './useAssetIdValidation';
import { useDocumentUploadState } from './useDocumentUpload';
import { useItemMutations } from './useItemMutations';
import { usePhotoUploadState } from './usePhotoUpload';

import type { LocationTreeNode } from '../location-tree-page/utils';

export type { ItemFormValues, PendingConnection };
export { extractPrefix } from './types';

interface CreateLocationInput {
  name: string;
  parentId: string | null;
}

/**
 * Shape consumed by the page's `ErrorView`, which distinguishes a missing
 * item (`data.code === 'NOT_FOUND'`) from any other failure.
 */
interface FormQueryError {
  data: { code: string } | null;
  message: string;
}

function toFormQueryError(error: unknown): FormQueryError | null {
  if (!error) return null;
  const message = error instanceof Error ? error.message : 'inventory API request failed';
  return { data: isNotFoundError(error) ? { code: 'NOT_FOUND' } : null, message };
}

function useResetFromItem(
  itemData: ItemQueryResult | undefined,
  reset: (values: ItemFormValues) => void
): void {
  const item = itemData?.data;
  useEffect(() => {
    if (!item) return;
    reset(itemToFormValues(item));
  }, [item, reset]);
}

function useUnsavedChangesGuard(isDirty: boolean): void {
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent): void => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);
}

function locationExistsInTree(nodes: LocationTreeNode[], id: string): boolean {
  for (const node of nodes) {
    if (node.id === id) return true;
    if (locationExistsInTree(node.children, id)) return true;
  }
  return false;
}

function useLocationIdPrefill(
  isEditMode: boolean,
  locationTree: LocationTreeNode[],
  setValue: (name: 'locationId', value: string, opts?: { shouldDirty?: boolean }) => void
) {
  const [searchParams] = useSearchParams();
  useEffect(() => {
    if (isEditMode || locationTree.length === 0) return;
    const paramId = searchParams.get('locationId') ?? '';
    if (paramId && locationExistsInTree(locationTree, paramId)) {
      setValue('locationId', paramId, { shouldDirty: false });
    }
  }, [isEditMode, locationTree, searchParams, setValue]);
}

function useLocationsAndCreate() {
  const queryClient = useQueryClient();
  const { data: locationsData } = useQuery({
    queryKey: ['inventory', 'locations', 'tree', undefined],
    queryFn: async () => unwrap(await locationsTree()),
  });
  const locationTree: LocationTreeNode[] = locationsData?.data ?? [];
  const createLocationMutation = useMutation({
    mutationFn: async (input: CreateLocationInput) =>
      unwrap(
        await locationsCreate({
          body: { name: input.name, parentId: input.parentId, sortOrder: 0 },
        })
      ),
    onSuccess: () => {
      toast.success('Location created');
    },
    onError: (err: Error) => toast.error(`Failed to create location: ${err.message}`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['inventory', 'locations'] }),
  });
  return { locationTree, createLocationMutation };
}

function useLocalFormState() {
  const [notesPreview, setNotesPreview] = useState(false);
  const [pendingConnections, setPendingConnections] = useState<PendingConnection[]>([]);
  const [connectionSearch, setConnectionSearch] = useState('');
  return {
    notesPreview,
    setNotesPreview,
    pendingConnections,
    setPendingConnections,
    connectionSearch,
    setConnectionSearch,
  };
}

function useConnectionSearch(connectionSearch: string, isEditMode: boolean) {
  const searchInput = useMemo(() => ({ search: connectionSearch, limit: 10 }), [connectionSearch]);
  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ['inventory', 'items', 'list', searchInput],
    queryFn: async () => unwrap(await itemsList({ query: searchInput })),
    enabled: !isEditMode && connectionSearch.length >= 2,
  });
  return { searchResults, searchLoading };
}

export function useItemFormPageModel() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;

  const form = useForm<ItemFormValues>({ defaultValues });
  const {
    watch,
    setValue,
    reset,
    formState: { isDirty },
  } = form;
  const typeValue = watch('type');

  const local = useLocalFormState();
  const photoState = usePhotoUploadState(id, isEditMode);
  const documentState = useDocumentUploadState(id, isEditMode);
  const assetId = useAssetIdValidation({ id, typeValue, setValue });
  const mutations = useItemMutations({
    id,
    isEditMode,
    pendingConnections: local.pendingConnections,
  });

  const { searchResults, searchLoading } = useConnectionSearch(local.connectionSearch, isEditMode);
  const { locationTree, createLocationMutation } = useLocationsAndCreate();
  useLocationIdPrefill(isEditMode, locationTree, setValue);

  const {
    data: itemData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['inventory', 'items', 'get', { id: id ?? '' }],
    queryFn: async () => unwrap(await itemsGet({ path: { id: id ?? '' } })),
    enabled: isEditMode,
  });

  useResetFromItem(itemData, reset);
  useUnsavedChangesGuard(isDirty);

  return {
    id,
    isEditMode,
    form,
    typeValue,
    ...local,
    searchResults,
    searchLoading,
    locationTree,
    createLocationMutation,
    itemData,
    isLoading,
    error: toFormQueryError(error),
    ...photoState,
    ...documentState,
    ...assetId,
    ...mutations,
  };
}
