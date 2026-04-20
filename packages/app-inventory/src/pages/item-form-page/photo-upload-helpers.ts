import { toast } from 'sonner';

import type { trpc } from '@pops/api-client';

import type { UploadedFile } from '../../components/PhotoUpload';
import type { ProcessedFile } from '../../hooks/useImageProcessor';

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

export function patchFile(
  prev: UploadedFile[],
  localId: string,
  patch: Partial<UploadedFile>
): UploadedFile[] {
  return prev.map((f) => (f.localId === localId ? { ...f, ...patch } : f));
}

export function applyProcessedToPending(
  prev: UploadedFile[],
  pending: UploadedFile[],
  processed: ProcessedFile[]
): UploadedFile[] {
  return prev.map((f) => {
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
  });
}

interface UploadOnePhotoArgs {
  pendingEntry: UploadedFile;
  processed: ProcessedFile;
  isEditMode: boolean;
  id: string | undefined;
  existingPhotosLength: number;
  index: number;
  uploadMutation: ReturnType<typeof trpc.inventory.photos.upload.useMutation>;
  setUploadFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>;
}

export async function uploadOnePhoto(args: UploadOnePhotoArgs): Promise<void> {
  const {
    pendingEntry,
    processed,
    isEditMode,
    id,
    existingPhotosLength,
    index,
    uploadMutation,
    setUploadFiles,
  } = args;
  const { localId } = pendingEntry;
  setUploadFiles((prev) => patchFile(prev, localId, { progress: 50 }));
  try {
    if (isEditMode && id) {
      await uploadMutation.mutateAsync({
        itemId: id,
        fileBase64: await blobToBase64(processed.processed),
        sortOrder: existingPhotosLength + index,
      });
    }
    setUploadFiles((prev) => patchFile(prev, localId, { status: 'done', progress: 100 }));
  } catch (err: unknown) {
    setUploadFiles((prev) =>
      patchFile(prev, localId, {
        status: 'error',
        error: err instanceof Error ? err.message : 'Upload failed',
      })
    );
    toast.error(`Failed to upload ${processed.original.name}`);
  }
}

interface ProcessAndUploadArgs {
  files: File[];
  pending: UploadedFile[];
  processFiles: (files: File[]) => Promise<ProcessedFile[]>;
  setUploadFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>;
  isEditMode: boolean;
  id: string | undefined;
  existingPhotosLength: number;
  uploadMutation: ReturnType<typeof trpc.inventory.photos.upload.useMutation>;
}

export async function processAndUpload(args: ProcessAndUploadArgs): Promise<void> {
  const {
    files,
    pending,
    processFiles,
    setUploadFiles,
    isEditMode,
    id,
    existingPhotosLength,
    uploadMutation,
  } = args;
  try {
    const processed = await processFiles(files);
    setUploadFiles((prev) => applyProcessedToPending(prev, pending, processed));
    for (let i = 0; i < processed.length; i++) {
      const pendingEntry = pending[i];
      const p = processed[i];
      if (!pendingEntry || !p) continue;
      await uploadOnePhoto({
        pendingEntry,
        processed: p,
        isEditMode,
        id,
        existingPhotosLength,
        index: i,
        uploadMutation,
        setUploadFiles,
      });
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
}
