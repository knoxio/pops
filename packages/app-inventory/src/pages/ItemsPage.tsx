import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  PageHeader,
} from '@pops/ui';

import { FiltersBar } from './items-page/FiltersBar';
import { ItemsContent } from './items-page/ItemsContent';
import { SummaryAndView } from './items-page/SummaryAndView';
import { useItemsPageModel, VIEW_STORAGE } from './items-page/useItemsPageModel';

function DeleteItemDialog({
  isOpen,
  isPending,
  onConfirm,
  onClose,
}: {
  isOpen: boolean;
  isPending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete item?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the item and all associated photos and connections.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={isPending}
            onClick={onConfirm}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ItemsPage() {
  const { t } = useTranslation('inventory');
  const model = useItemsPageModel();
  const { filters, navigate } = model;
  const hasSearchOrFilters = !!filters.search || model.hasActiveFilters;

  const addButton = (
    <Button onClick={() => navigate('/inventory/items/new')} prefix={<Plus className="h-4 w-4" />}>
      Add Item
    </Button>
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} actions={addButton} />
      <FiltersBar
        search={filters.search}
        typeFilter={filters.typeFilter}
        conditionFilter={filters.conditionFilter}
        inUseFilter={filters.inUseFilter}
        locationFilter={filters.locationFilter}
        typeOptions={model.typeOptions}
        locationOptions={model.locationOptions}
        hasActiveFilters={model.hasActiveFilters}
        onParamChange={filters.setParam}
        onClearFilters={filters.clearFilters}
        onSearchKeyDown={model.handleSearchKeyDown}
      />
      {!model.isLoading && (
        <SummaryAndView
          totalCount={model.totalCount}
          totalReplacementValue={model.totalReplacementValue}
          totalResaleValue={model.totalResaleValue}
          viewMode={model.viewMode}
          onViewChange={model.setViewMode}
          storageKey={VIEW_STORAGE}
        />
      )}
      <ItemsContent
        isLoading={model.isLoading}
        items={model.items}
        viewMode={model.viewMode}
        hasSearchOrFilters={hasSearchOrFilters}
        locationPathMap={model.locationPathMap}
        onOpen={(id) => navigate(`/inventory/items/${id}`)}
        onEdit={(id) => navigate(`/inventory/items/${id}/edit`)}
        onDeleteRequest={model.setDeletingItemId}
      />
      <DeleteItemDialog
        isOpen={model.deletingItemId !== null}
        isPending={model.deleteMutation.isPending}
        onConfirm={() =>
          model.deletingItemId && model.deleteMutation.mutate({ id: model.deletingItemId })
        }
        onClose={() => model.setDeletingItemId(null)}
      />
    </div>
  );
}
