import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';

import { usePillarMutation, usePillarQuery } from '@pops/pillar-sdk/react';

import { itemToFormValues, type ItemQueryResult } from './item-record';
import { defaultValues, type ItemFormValues, type PendingConnection } from './types';
import { useAssetIdValidation } from './useAssetIdValidation';
import { useDocumentUploadState } from './useDocumentUpload';
import { useItemMutations } from './useItemMutations';
import { usePhotoUploadState } from './usePhotoUpload';

import type { InventoryItem } from '@pops/api/modules/inventory/items/types';

import type { LocationTreeNode } from '../location-tree-page/utils';

export type { ItemFormValues, PendingConnection };
export { extractPrefix } from './types';

interface LocationsTreeResult {
  data: LocationTreeNode[];
}

interface ItemsListResult {
  data: InventoryItem[];
}

interface CreateLocationInput {
  name: string;
  parentId: string | null;
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
  const { data: locationsData } = usePillarQuery<LocationsTreeResult>(
    'inventory',
    ['locations', 'tree'],
    undefined
  );
  const locationTree = locationsData?.data ?? [];
  const createLocationMutation = usePillarMutation<CreateLocationInput, unknown>(
    'inventory',
    ['locations', 'create'],
    {
      onSuccess: () => {
        toast.success('Location created');
      },
      onError: (err) => toast.error(`Failed to create location: ${err.message}`),
    }
  );
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

  const { data: searchResults, isLoading: searchLoading } = usePillarQuery<ItemsListResult>(
    'inventory',
    ['items', 'list'],
    { search: local.connectionSearch, limit: 10 },
    { enabled: !isEditMode && local.connectionSearch.length >= 2 }
  );
  const { locationTree, createLocationMutation } = useLocationsAndCreate();
  useLocationIdPrefill(isEditMode, locationTree, setValue);

  const {
    data: itemData,
    isLoading,
    error,
  } = usePillarQuery<ItemQueryResult>(
    'inventory',
    ['items', 'get'],
    { id: id ?? '' },
    { enabled: isEditMode }
  );

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
    error,
    ...photoState,
    ...documentState,
    ...assetId,
    ...mutations,
  };
}
