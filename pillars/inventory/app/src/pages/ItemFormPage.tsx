import { Link } from 'react-router';

import { Alert, AlertDescription, AlertTitle, PageHeader, Skeleton } from '@pops/ui';

import { FormFooter } from './item-form-page/sections/FormFooter';
import { NotesSection } from './item-form-page/sections/NotesSection';
import {
  ConnectionsBlock,
  CoreSection,
  DocumentsSection,
  PhotosSection,
} from './item-form-page/sections/section-adapters';
import { useItemFormPageModel } from './item-form-page/useItemFormPageModel';

export { extractPrefix } from './item-form-page/useItemFormPageModel';

type Model = ReturnType<typeof useItemFormPageModel>;

function FormSkeleton() {
  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

function ErrorView({
  error,
}: {
  error: { data?: { code?: string | undefined } | null; message: string };
}) {
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

function buildBreadcrumbs(
  isEditMode: boolean,
  id: string | undefined,
  editItemName: string | undefined
) {
  if (isEditMode && editItemName) {
    return [
      { label: 'Inventory', href: '/inventory' },
      { label: editItemName, href: `/inventory/items/${id}` },
      { label: 'Edit' },
    ];
  }
  return [{ label: 'Inventory', href: '/inventory' }, { label: 'New Item' }];
}

function FormBody({ model }: { model: Model }) {
  const { form, isEditMode, isMutating, notesPreview, setNotesPreview, onSubmit } = model;
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
      <CoreSection model={model} />
      <PhotosSection model={model} />
      <DocumentsSection model={model} />
      <NotesSection
        register={form.register}
        watch={form.watch}
        notesPreview={notesPreview}
        onTogglePreview={() => setNotesPreview((v) => !v)}
      />
      <ConnectionsBlock model={model} />
      <FormFooter isEditMode={isEditMode} isMutating={isMutating} />
    </form>
  );
}

export function ItemFormPage() {
  const model = useItemFormPageModel();
  const { id, isEditMode, isLoading, error, itemData } = model;

  if (isEditMode && isLoading) return <FormSkeleton />;
  if (isEditMode && error) return <ErrorView error={error} />;

  const editItemName = itemData?.data?.itemName;
  return (
    <div className="p-6 max-w-2xl">
      <PageHeader
        title={isEditMode ? 'Edit Item' : 'New Item'}
        backHref={isEditMode && id ? `/inventory/items/${id}` : '/inventory'}
        breadcrumbs={buildBreadcrumbs(isEditMode, id, editItemName)}
        renderLink={Link}
        className="mb-8"
      />
      <FormBody model={model} />
    </div>
  );
}
