import { useCallback, useEffect, useRef, useState } from 'react';

import { trpc } from '@pops/api-client';

import { useImageProcessor } from '../../hooks/useImageProcessor';
import { processAndUpload } from './photo-upload-helpers';

import type { PhotoItem } from '../../components/PhotoGallery';
import type { UploadedFile } from '../../components/PhotoUpload';

function usePhotoMutations(
  id: string | undefined,
  isEditMode: boolean,
  setDeleteConfirmId: (v: number | null) => void
) {
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
  return { existingPhotos, uploadMutation, photoDeleteMutation, reorderMutation };
}

function useUploadFilesState(): {
  uploadFiles: UploadedFile[];
  setUploadFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>;
} {
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
  return { uploadFiles, setUploadFiles };
}

export function usePhotoUploadState(id: string | undefined, isEditMode: boolean) {
  const { uploadFiles, setUploadFiles } = useUploadFilesState();
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const { processFiles, processing: imageProcessing } = useImageProcessor();
  const { existingPhotos, uploadMutation, photoDeleteMutation, reorderMutation } =
    usePhotoMutations(id, isEditMode, setDeleteConfirmId);

  const handleFilesSelected = useCallback(
    async (files: File[]) => {
      const pending: UploadedFile[] = files.map((file, i) => ({
        localId: `${Date.now()}-${i}`,
        file,
        previewUrl: '',
        status: 'pending' as const,
      }));
      setUploadFiles((prev) => [...prev, ...pending]);
      await processAndUpload({
        files,
        pending,
        processFiles,
        setUploadFiles,
        isEditMode,
        id,
        existingPhotosLength: existingPhotos.length,
        uploadMutation,
      });
    },
    [processFiles, isEditMode, id, uploadMutation, existingPhotos.length, setUploadFiles]
  );

  const handleRemoveUpload = useCallback(
    (localId: string) => {
      setUploadFiles((prev) => {
        const file = prev.find((f) => f.localId === localId);
        if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl);
        return prev.filter((f) => f.localId !== localId);
      });
    },
    [setUploadFiles]
  );

  const confirmDeletePhoto = useCallback(() => {
    if (deleteConfirmId !== null) photoDeleteMutation.mutate({ id: deleteConfirmId });
  }, [deleteConfirmId, photoDeleteMutation]);

  return {
    uploadFiles,
    deleteConfirmId,
    setDeleteConfirmId,
    existingPhotos,
    imageProcessing,
    photoDeleteMutation,
    reorderMutation,
    handleFilesSelected,
    handleRemoveUpload,
    handleDeletePhoto: setDeleteConfirmId,
    confirmDeletePhoto,
  };
}
