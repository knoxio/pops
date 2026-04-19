import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import { useImageProcessor } from '../../hooks/useImageProcessor';

import type { PhotoItem } from '../../components/PhotoGallery';
import type { UploadedFile } from '../../components/PhotoUpload';

export interface PendingConnection {
  id: string;
  itemName: string;
}

export interface ItemFormValues {
  itemName: string;
  brand: string;
  model: string;
  itemId: string;
  type: string;
  condition: string;
  locationId: string;
  inUse: boolean;
  deductible: boolean;
  purchaseDate: string;
  warrantyExpires: string;
  purchasePrice: string;
  replacementValue: string;
  resaleValue: string;
  assetId: string;
  notes: string;
}

const defaultValues: ItemFormValues = {
  itemName: '',
  brand: '',
  model: '',
  itemId: '',
  type: '',
  condition: 'good',
  locationId: '',
  inUse: false,
  deductible: false,
  purchaseDate: '',
  warrantyExpires: '',
  purchasePrice: '',
  replacementValue: '',
  resaleValue: '',
  assetId: '',
  notes: '',
};

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

export function extractPrefix(type: string): string {
  const firstWord = type.split(/\s+/)[0] ?? '';
  const upper = firstWord.toUpperCase();
  return upper.length <= 6 ? upper : upper.slice(0, 4);
}

export function useItemFormPageModel() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  const form = useForm<ItemFormValues>({ defaultValues });
  const {
    watch,
    setValue,
    reset,
    formState: { isDirty },
  } = form;
  const typeValue = watch('type');

  const [assetIdError, setAssetIdError] = useState<string | null>(null);
  const [assetIdChecking, setAssetIdChecking] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [notesPreview, setNotesPreview] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<UploadedFile[]>([]);
  const uploadFilesRef = useRef(uploadFiles);
  uploadFilesRef.current = uploadFiles;
  useEffect(
    () => () => {
      for (const f of uploadFilesRef.current) {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      }
    },
    []
  );
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [pendingConnections, setPendingConnections] = useState<PendingConnection[]>([]);
  const [connectionSearch, setConnectionSearch] = useState('');

  const { processFiles, processing: imageProcessing } = useImageProcessor();

  const { data: photosData, refetch: refetchPhotos } = trpc.inventory.photos.listForItem.useQuery(
    { itemId: id ?? '' },
    { enabled: isEditMode }
  );
  const existingPhotos: PhotoItem[] = photosData?.data ?? [];

  const uploadMutation = trpc.inventory.photos.upload.useMutation({
    onSuccess: () => void refetchPhotos(),
  });
  const photoDeleteMutation = trpc.inventory.photos.remove.useMutation({
    onSuccess: () => {
      void refetchPhotos();
      setDeleteConfirmId(null);
    },
  });
  const reorderMutation = trpc.inventory.photos.reorder.useMutation({
    onSuccess: () => void refetchPhotos(),
  });

  const { data: searchResults, isLoading: searchLoading } = trpc.inventory.items.list.useQuery(
    { search: connectionSearch, limit: 10 },
    { enabled: !isEditMode && connectionSearch.length >= 2 }
  );

  const connectMutation = trpc.inventory.connections.connect.useMutation();

  const { data: locationsData } = trpc.inventory.locations.tree.useQuery();
  const locationTree = locationsData?.data ?? [];

  const createLocationMutation = trpc.inventory.locations.create.useMutation({
    onSuccess: () => {
      toast.success('Location created');
      void utils.inventory.locations.tree.invalidate();
    },
    onError: (err) => toast.error(`Failed to create location: ${err.message}`),
  });

  const {
    data: itemData,
    isLoading,
    error,
  } = trpc.inventory.items.get.useQuery({ id: id ?? '' }, { enabled: isEditMode });

  useEffect(() => {
    if (itemData?.data) {
      const item = itemData.data;
      reset({
        itemName: item.itemName,
        brand: item.brand ?? '',
        model: item.model ?? '',
        itemId: item.itemId ?? '',
        type: item.type ?? '',
        condition: item.condition ?? '',
        locationId: item.locationId ?? '',
        inUse: item.inUse,
        deductible: item.deductible,
        purchaseDate: item.purchaseDate ?? '',
        warrantyExpires: item.warrantyExpires ?? '',
        purchasePrice: item.purchasePrice?.toString() ?? '',
        replacementValue: item.replacementValue?.toString() ?? '',
        resaleValue: item.resaleValue?.toString() ?? '',
        assetId: item.assetId ?? '',
        notes: item.notes ?? '',
      });
    }
  }, [itemData, reset]);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const validateAssetIdUniqueness = useCallback(
    async (value: string) => {
      if (!value.trim()) {
        setAssetIdError(null);
        return;
      }
      setAssetIdChecking(true);
      try {
        const result = await utils.inventory.items.searchByAssetId.fetch({ assetId: value.trim() });
        if (result.data && result.data.id !== id) {
          setAssetIdError(`Asset ID already in use by ${result.data.itemName}`);
        } else {
          setAssetIdError(null);
        }
      } catch {
        setAssetIdError(null);
      } finally {
        setAssetIdChecking(false);
      }
    },
    [id, utils]
  );

  const handleAutoGenerate = useCallback(async () => {
    if (!typeValue) return;
    setGenerating(true);
    try {
      const prefix = extractPrefix(typeValue);
      const result = await utils.inventory.items.countByAssetPrefix.fetch({ prefix });
      const nextNum = result.data + 1;
      const padded = nextNum >= 100 ? String(nextNum) : String(nextNum).padStart(2, '0');
      const newAssetId = `${prefix}${padded}`;
      setValue('assetId', newAssetId, { shouldDirty: true });
      setAssetIdError(null);
      void validateAssetIdUniqueness(newAssetId);
    } catch {
      toast.error('Failed to generate asset ID');
    } finally {
      setGenerating(false);
    }
  }, [typeValue, utils, setValue, validateAssetIdUniqueness]);

  const handleFilesSelected = useCallback(
    async (files: File[]) => {
      const pending: UploadedFile[] = files.map((file, i) => ({
        localId: `${Date.now()}-${i}`,
        file,
        previewUrl: '',
        status: 'pending' as const,
      }));
      setUploadFiles((prev) => [...prev, ...pending]);
      try {
        const processed = await processFiles(files);
        setUploadFiles((prev) =>
          prev.map((f) => {
            const idx = pending.findIndex((p) => p.localId === f.localId);
            const match = idx >= 0 ? processed[idx] : undefined;
            if (!match) return f;
            return {
              ...f,
              previewUrl: match.previewUrl,
              originalSize: match.originalSize,
              processedSize: match.processedSize,
              status: 'uploading' as const,
              progress: 0,
            };
          })
        );
        for (let i = 0; i < processed.length; i++) {
          const pendingEntry = pending[i];
          const p = processed[i];
          if (!pendingEntry || !p) continue;
          const { localId } = pendingEntry;
          try {
            setUploadFiles((prev) =>
              prev.map((f) => (f.localId === localId ? { ...f, progress: 50 } : f))
            );
            if (isEditMode && id) {
              await uploadMutation.mutateAsync({
                itemId: id,
                fileBase64: await blobToBase64(p.processed),
                sortOrder: existingPhotos.length + i,
              });
            }
            setUploadFiles((prev) =>
              prev.map((f) =>
                f.localId === localId ? { ...f, status: 'done' as const, progress: 100 } : f
              )
            );
          } catch (err: unknown) {
            setUploadFiles((prev) =>
              prev.map((f) =>
                f.localId === localId
                  ? {
                      ...f,
                      status: 'error' as const,
                      error: err instanceof Error ? err.message : 'Upload failed',
                    }
                  : f
              )
            );
            toast.error(`Failed to upload ${p.original.name}`);
          }
        }
      } catch {
        setUploadFiles((prev) =>
          prev.map((f) =>
            pending.some((p) => p.localId === f.localId)
              ? { ...f, status: 'error' as const, error: 'Image processing failed' }
              : f
          )
        );
        toast.error('Failed to process images');
      }
    },
    [processFiles, isEditMode, id, uploadMutation, existingPhotos.length]
  );

  const createMutation = trpc.inventory.items.create.useMutation({
    onSuccess: async (result) => {
      const newItemId = result.data.id;
      if (pendingConnections.length > 0) {
        let connected = 0;
        for (const conn of pendingConnections) {
          try {
            await connectMutation.mutateAsync({ itemAId: newItemId, itemBId: conn.id });
            connected++;
          } catch {
            /* skip */
          }
        }
        toast.success(
          connected > 0
            ? `Item created with ${connected} connection${connected > 1 ? 's' : ''}`
            : 'Item created'
        );
      } else {
        toast.success('Item created');
      }
      void utils.inventory.items.list.invalidate();
      navigate(`/inventory/items/${newItemId}`);
    },
    onError: (err) => toast.error(`Failed to create: ${err.message}`),
  });

  const updateMutation = trpc.inventory.items.update.useMutation({
    onSuccess: () => {
      toast.success('Item updated');
      void utils.inventory.items.list.invalidate();
      void utils.inventory.items.get.invalidate({ id: id ?? '' });
      navigate(`/inventory/items/${id}`);
    },
    onError: (err) => toast.error(`Failed to update: ${err.message}`),
  });

  const onSubmit = (values: ItemFormValues) => {
    if (!values.itemName.trim()) {
      toast.error('Item name is required');
      return;
    }
    const payload = {
      itemName: values.itemName.trim(),
      brand: values.brand || null,
      model: values.model || null,
      itemId: values.itemId || null,
      type: values.type || null,
      condition: values.condition || null,
      room: null,
      locationId: values.locationId || null,
      inUse: values.inUse,
      deductible: values.deductible,
      purchaseDate: values.purchaseDate || null,
      warrantyExpires: values.warrantyExpires || null,
      purchasePrice: values.purchasePrice ? parseFloat(values.purchasePrice) : null,
      replacementValue: values.replacementValue ? parseFloat(values.replacementValue) : null,
      resaleValue: values.resaleValue ? parseFloat(values.resaleValue) : null,
      assetId: values.assetId || null,
      notes: values.notes || null,
    };
    if (isEditMode) {
      updateMutation.mutate({ id: id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  return {
    id,
    isEditMode,
    form,
    typeValue,
    assetIdError,
    assetIdChecking,
    generating,
    notesPreview,
    setNotesPreview,
    uploadFiles,
    deleteConfirmId,
    setDeleteConfirmId,
    existingPhotos,
    imageProcessing,
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
    reorderMutation,
    photoDeleteMutation,
    isMutating: createMutation.isPending || updateMutation.isPending,
    handleFilesSelected,
    handleRemoveUpload: (localId: string) =>
      setUploadFiles((prev) => {
        const file = prev.find((f) => f.localId === localId);
        if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl);
        return prev.filter((f) => f.localId !== localId);
      }),
    handleDeletePhoto: (photoId: number) => setDeleteConfirmId(photoId),
    confirmDeletePhoto: () => {
      if (deleteConfirmId !== null) photoDeleteMutation.mutate({ id: deleteConfirmId });
    },
    validateAssetIdUniqueness,
    handleAutoGenerate,
    onSubmit,
  };
}
