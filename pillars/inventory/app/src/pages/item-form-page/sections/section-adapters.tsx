import { ConnectionsSection } from './ConnectionsSection';
import { CoreFieldsSection } from './CoreFieldsSection';
import { DocumentUploadSection } from './DocumentUploadSection';
import { PhotoUploadSection } from './PhotoUploadSection';

import type { useItemFormPageModel } from '../useItemFormPageModel';

/**
 * Thin presentational adapters that take the full form model and pass only
 * the slice each section needs. They live next to the section components so
 * `ItemFormPage.tsx` can stay under the file-length lint cap and so the
 * model wiring is co-located with the sections it feeds.
 */

type Model = ReturnType<typeof useItemFormPageModel>;

export function CoreSection({ model }: { model: Model }) {
  const {
    form: {
      register,
      control,
      watch,
      setValue,
      formState: { errors },
    },
    assetIdError,
    assetIdChecking,
    generating,
    locationTree,
    createLocationMutation,
    handleAutoGenerate,
    validateAssetIdUniqueness,
  } = model;
  return (
    <CoreFieldsSection
      register={register}
      control={control}
      watch={watch}
      setValue={setValue}
      errors={errors}
      assetIdError={assetIdError}
      assetIdChecking={assetIdChecking}
      generating={generating}
      locationTree={locationTree}
      onAutoGenerate={() => void handleAutoGenerate()}
      onValidateAssetId={(v) => void validateAssetIdUniqueness(v)}
      onCreateLocation={(name, parentId) => createLocationMutation.mutate({ name, parentId })}
    />
  );
}

export function PhotosSection({ model }: { model: Model }) {
  const {
    id,
    isEditMode,
    existingPhotos,
    uploadFiles,
    imageProcessing,
    reorderMutation,
    deleteConfirmId,
    setDeleteConfirmId,
    photoDeleteMutation,
    handleFilesSelected,
    handleRemoveUpload,
    handleDeletePhoto,
    confirmDeletePhoto,
  } = model;
  return (
    <PhotoUploadSection
      isEditMode={isEditMode}
      existingPhotos={existingPhotos}
      uploadFiles={uploadFiles}
      imageProcessing={imageProcessing}
      isReordering={reorderMutation.isPending}
      deleteConfirmId={deleteConfirmId}
      isDeleting={photoDeleteMutation.isPending}
      onFilesSelected={handleFilesSelected}
      onRemoveUpload={handleRemoveUpload}
      onDeletePhoto={handleDeletePhoto}
      onConfirmDelete={confirmDeletePhoto}
      onCancelDelete={() => setDeleteConfirmId(null)}
      onReorder={(orderedIds) => {
        if (id) reorderMutation.mutate({ itemId: id, orderedIds });
      }}
    />
  );
}

export function DocumentsSection({ model }: { model: Model }) {
  const {
    isEditMode,
    existingDocuments,
    documentUploadFiles,
    documentDeleteConfirmId,
    setDocumentDeleteConfirmId,
    documentRemoveMutation,
    handleDocumentFilesSelected,
    handleDocumentRemoveUpload,
    handleDeleteDocument,
    confirmDeleteDocument,
  } = model;
  // Disable the upload widget while any pending entry is mid-flight to avoid
  // racy double-submits when the user clicks the picker repeatedly.
  const isUploading = documentUploadFiles.some((f) => f.status === 'uploading');
  return (
    <DocumentUploadSection
      isEditMode={isEditMode}
      existingDocuments={existingDocuments}
      uploadFiles={documentUploadFiles}
      deleteConfirmId={documentDeleteConfirmId}
      isDeleting={documentRemoveMutation.isPending}
      isUploading={isUploading}
      onFilesSelected={handleDocumentFilesSelected}
      onRemoveUpload={handleDocumentRemoveUpload}
      onDeleteDocument={handleDeleteDocument}
      onConfirmDelete={confirmDeleteDocument}
      onCancelDelete={() => setDocumentDeleteConfirmId(null)}
    />
  );
}

export function ConnectionsBlock({ model }: { model: Model }) {
  const {
    isEditMode,
    pendingConnections,
    setPendingConnections,
    connectionSearch,
    setConnectionSearch,
    searchResults,
    searchLoading,
  } = model;
  if (isEditMode) return null;
  return (
    <ConnectionsSection
      pendingConnections={pendingConnections}
      connectionSearch={connectionSearch}
      searchResults={searchResults}
      searchLoading={searchLoading}
      onSearchChange={setConnectionSearch}
      onAdd={(item) =>
        setPendingConnections((prev) => [...prev, { id: item.id, itemName: item.itemName }])
      }
      onRemove={(itemId) => setPendingConnections((prev) => prev.filter((c) => c.id !== itemId))}
    />
  );
}
