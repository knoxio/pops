import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { trpc } from '@pops/api-client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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

  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const deleteMutation = trpc.inventory.items.delete.useMutation({
    onSuccess: () => {
      void utils.inventory.items.list.invalidate();
      setDeletingItemId(null);
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} />
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
        onAdd={() => navigate('/inventory/items/new')}
        onOpen={(id) => navigate(`/inventory/items/${id}`)}
        onEdit={(id) => navigate(`/inventory/items/${id}/edit`)}
        onDeleteRequest={setDeletingItemId}
      />
      <DeleteItemDialog
        isOpen={deletingItemId !== null}
        isPending={deleteMutation.isPending}
        onConfirm={() => deletingItemId && deleteMutation.mutate({ id: deletingItemId })}
        onClose={() => setDeletingItemId(null)}
      />
    </div>
  );
}
