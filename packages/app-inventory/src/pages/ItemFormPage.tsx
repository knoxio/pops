import { Save } from 'lucide-react';
import { Link } from 'react-router';

import { Alert, AlertDescription, AlertTitle, Button, PageHeader, Skeleton } from '@pops/ui';

import { ConnectionsSection } from './item-form-page/sections/ConnectionsSection';
import { CoreFieldsSection } from './item-form-page/sections/CoreFieldsSection';
import { NotesSection } from './item-form-page/sections/NotesSection';
import { PhotoUploadSection } from './item-form-page/sections/PhotoUploadSection';
import { useItemFormPageModel } from './item-form-page/useItemFormPageModel';

export { extractPrefix } from './item-form-page/useItemFormPageModel';

export function ItemFormPage() {
  const model = useItemFormPageModel();
  const {
    id,
    isEditMode,
    form,
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
    isMutating,
    handleFilesSelected,
    handleRemoveUpload,
    handleDeletePhoto,
    confirmDeletePhoto,
    validateAssetIdUniqueness,
    handleAutoGenerate,
    onSubmit,
  } = model;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = form;

  if (isEditMode && isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-2xl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (isEditMode && error) {
    const is404 = error.data?.code === 'NOT_FOUND';
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTitle>{is404 ? 'Item not found' : 'Error'}</AlertTitle>
          <AlertDescription>{is404 ? "This item doesn't exist." : error.message}</AlertDescription>
        </Alert>
        <Link
          to="/inventory"
          className="mt-4 inline-block text-sm text-app-accent hover:text-app-accent/80 underline font-medium"
        >
          Back to inventory
        </Link>
      </div>
    );
  }

  const editItemName = itemData?.data?.itemName;

  return (
    <div className="p-6 max-w-2xl">
      <PageHeader
        title={isEditMode ? 'Edit Item' : 'New Item'}
        backHref={isEditMode && id ? `/inventory/items/${id}` : '/inventory'}
        breadcrumbs={
          isEditMode && editItemName
            ? [
                { label: 'Inventory', href: '/inventory' },
                { label: editItemName, href: `/inventory/items/${id}` },
                { label: 'Edit' },
              ]
            : [{ label: 'Inventory', href: '/inventory' }, { label: 'New Item' }]
        }
        renderLink={Link}
        className="mb-8"
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        <CoreFieldsSection
          register={register}
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

        <NotesSection
          register={register}
          watch={watch}
          notesPreview={notesPreview}
          onTogglePreview={() => setNotesPreview((v) => !v)}
        />

        {!isEditMode && (
          <ConnectionsSection
            pendingConnections={pendingConnections}
            connectionSearch={connectionSearch}
            searchResults={searchResults}
            searchLoading={searchLoading}
            onSearchChange={setConnectionSearch}
            onAdd={(item) =>
              setPendingConnections((prev) => [...prev, { id: item.id, itemName: item.itemName }])
            }
            onRemove={(itemId) =>
              setPendingConnections((prev) => prev.filter((c) => c.id !== itemId))
            }
          />
        )}

        <div className="flex gap-4 pt-6 border-t">
          <Button
            type="submit"
            size="lg"
            className="flex-1 bg-app-accent hover:bg-app-accent/80 text-white font-bold transition-all shadow-md shadow-app-accent/20"
            loading={isMutating}
            loadingText={isEditMode ? 'Saving...' : 'Creating...'}
          >
            <Save className="h-5 w-5 mr-2" />
            {isEditMode ? 'Save Changes' : 'Create Item'}
          </Button>
          <Link to="/inventory">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="px-8 font-bold border-app-accent/20 hover:bg-app-accent/5"
            >
              Cancel
            </Button>
          </Link>
        </div>
      </form>
    </div>
  );
}
