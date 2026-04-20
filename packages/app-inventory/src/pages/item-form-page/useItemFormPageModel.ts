import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useParams } from 'react-router';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import { defaultValues, type ItemFormValues, type PendingConnection } from './types';
import { useAssetIdValidation } from './useAssetIdValidation';
import { useItemMutations } from './useItemMutations';
import { usePhotoUploadState } from './usePhotoUpload';

export type { ItemFormValues, PendingConnection };
export { extractPrefix } from './types';

interface ItemRecord {
  itemName: string;
  brand: string | null;
  model: string | null;
  itemId: string | null;
  type: string | null;
  condition: string | null;
  locationId: string | null;
  inUse: boolean;
  deductible: boolean;
  purchaseDate: string | null;
  warrantyExpires: string | null;
  purchasePrice: number | null;
  replacementValue: number | null;
  resaleValue: number | null;
  assetId: string | null;
  notes: string | null;
}

interface ItemQueryResult {
  data?: ItemRecord;
}

function s(v: string | null | undefined): string {
  return v ?? '';
}

function n(v: number | null | undefined): string {
  return v?.toString() ?? '';
}

function itemToFormValues(item: ItemRecord): ItemFormValues {
  return {
    itemName: item.itemName,
    brand: s(item.brand),
    model: s(item.model),
    itemId: s(item.itemId),
    type: s(item.type),
    condition: s(item.condition),
    locationId: s(item.locationId),
    inUse: item.inUse,
    deductible: item.deductible,
    purchaseDate: s(item.purchaseDate),
    warrantyExpires: s(item.warrantyExpires),
    purchasePrice: n(item.purchasePrice),
    replacementValue: n(item.replacementValue),
    resaleValue: n(item.resaleValue),
    assetId: s(item.assetId),
    notes: s(item.notes),
  };
}

function useResetFromItem(
  itemData: ItemQueryResult | undefined,
  reset: (values: ItemFormValues) => void
): void {
  useEffect(() => {
    if (!itemData?.data) return;
    reset(itemToFormValues(itemData.data));
  }, [itemData, reset]);
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

function useLocationsAndCreate() {
  const utils = trpc.useUtils();
  const { data: locationsData } = trpc.inventory.locations.tree.useQuery();
  const locationTree = locationsData?.data ?? [];
  const createLocationMutation = trpc.inventory.locations.create.useMutation({
    onSuccess: () => {
      toast.success('Location created');
      void utils.inventory.locations.tree.invalidate();
    },
    onError: (err) => toast.error(`Failed to create location: ${err.message}`),
  });
  return { locationTree, createLocationMutation };
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

  const [notesPreview, setNotesPreview] = useState(false);
  const [pendingConnections, setPendingConnections] = useState<PendingConnection[]>([]);
  const [connectionSearch, setConnectionSearch] = useState('');

  const photoState = usePhotoUploadState(id, isEditMode);
  const assetId = useAssetIdValidation({ id, typeValue, setValue });
  const mutations = useItemMutations({ id, isEditMode, pendingConnections });

  const { data: searchResults, isLoading: searchLoading } = trpc.inventory.items.list.useQuery(
    { search: connectionSearch, limit: 10 },
    { enabled: !isEditMode && connectionSearch.length >= 2 }
  );
  const { locationTree, createLocationMutation } = useLocationsAndCreate();

  const {
    data: itemData,
    isLoading,
    error,
  } = trpc.inventory.items.get.useQuery({ id: id ?? '' }, { enabled: isEditMode });

  useResetFromItem(itemData, reset);
  useUnsavedChangesGuard(isDirty);

  return {
    id,
    isEditMode,
    form,
    typeValue,
    notesPreview,
    setNotesPreview,
    pendingConnections,
    setPendingConnections,
    connectionSearch,
    setConnectionSearch,
    searchResults,
    searchLoading,
    locationTree,
    createLocationMutation,
    itemData,
    isLoading,
    error,
    ...photoState,
    ...assetId,
    ...mutations,
  };
}
