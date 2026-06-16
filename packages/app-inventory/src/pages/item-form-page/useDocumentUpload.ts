import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { unwrap } from '../../inventory-api-helpers.js';
import {
  documentFilesListForItem,
  documentFilesRemoveUpload,
  documentFilesUpload,
} from '../../inventory-api/index.js';
import { processAndUploadDocuments, type DocumentUploadMutation } from './document-upload-helpers';

import type { DocumentItem } from '../../components/DocumentList';
import type { PendingDocumentFile } from '../../components/DocumentUpload';

interface DocumentUploadInput {
  itemId: string;
  fileName: string;
  mimeType: string;
  fileBase64: string;
}

interface DocumentRemoveInput {
  id: number;
}

function useDocumentMutations(
  id: string | undefined,
  isEditMode: boolean,
  setDeleteConfirmId: (v: number | null) => void
) {
  const queryClient = useQueryClient();
  const invalidateDocumentFiles = () =>
    queryClient.invalidateQueries({ queryKey: ['inventory', 'documentFiles'] });

  const { data: documentsData } = useQuery({
    queryKey: ['inventory', 'documentFiles', 'listForItem', { itemId: id ?? '' }],
    queryFn: async () => unwrap(await documentFilesListForItem({ path: { itemId: id ?? '' } })),
    enabled: isEditMode,
  });
  const existingDocuments: DocumentItem[] = documentsData?.data ?? [];
  const uploadMutation = useMutation({
    mutationFn: async ({ itemId, fileName, mimeType, fileBase64 }: DocumentUploadInput) =>
      unwrap(
        await documentFilesUpload({ path: { itemId }, body: { fileName, mimeType, fileBase64 } })
      ),
    onSettled: invalidateDocumentFiles,
  });
  const removeMutation = useMutation({
    mutationFn: async ({ id: uploadId }: DocumentRemoveInput) =>
      unwrap(await documentFilesRemoveUpload({ path: { id: uploadId } })),
    onSuccess: () => {
      setDeleteConfirmId(null);
    },
    onSettled: invalidateDocumentFiles,
  });
  return { existingDocuments, uploadMutation, removeMutation };
}

/**
 * Item-form-page state hook for direct document uploads. Mirrors
 * {@link usePhotoUploadState} but talks to `inventory.documentFiles.*`
 * and uses {@link PendingDocumentFile} for pending entries.
 *
 * On create mode (no `id`) the upload mutation is skipped — pending entries
 * stay as 'pending' and the parent is expected to re-trigger uploads after
 * the item is saved. Today the form does not yet wire that follow-up step
 * because the backend requires the item to exist; this matches the photo
 * upload behaviour for create mode.
 */
export function useDocumentUploadState(id: string | undefined, isEditMode: boolean) {
  const [uploadFiles, setUploadFiles] = useState<PendingDocumentFile[]>([]);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const { existingDocuments, uploadMutation, removeMutation } = useDocumentMutations(
    id,
    isEditMode,
    setDeleteConfirmId
  );

  const handleFilesSelected = useCallback(
    async (files: File[]) => {
      const pending: PendingDocumentFile[] = files.map((file, i) => ({
        localId: `${Date.now()}-${i}`,
        file,
        status: 'pending' as const,
      }));
      setUploadFiles((prev) => [...prev, ...pending]);
      await processAndUploadDocuments({
        pending,
        setUploadFiles,
        isEditMode,
        id,
        uploadMutation: uploadMutation satisfies DocumentUploadMutation,
      });
    },
    [isEditMode, id, uploadMutation]
  );

  const handleRemoveUpload = useCallback((localId: string) => {
    setUploadFiles((prev) => prev.filter((f) => f.localId !== localId));
  }, []);

  const confirmDeleteDocument = useCallback(() => {
    if (deleteConfirmId !== null) removeMutation.mutate({ id: deleteConfirmId });
  }, [deleteConfirmId, removeMutation]);

  return {
    documentUploadFiles: uploadFiles,
    documentDeleteConfirmId: deleteConfirmId,
    setDocumentDeleteConfirmId: setDeleteConfirmId,
    existingDocuments,
    documentRemoveMutation: removeMutation,
    handleDocumentFilesSelected: handleFilesSelected,
    handleDocumentRemoveUpload: handleRemoveUpload,
    handleDeleteDocument: setDeleteConfirmId,
    confirmDeleteDocument,
  };
}
