import { useTranslation } from 'react-i18next';

import { PageHeader } from '@pops/ui';

import { FiltersBar } from './items-page/FiltersBar';
import { ItemsContent } from './items-page/ItemsContent';
import { SummaryAndView } from './items-page/SummaryAndView';
import { useItemsPageModel, VIEW_STORAGE } from './items-page/useItemsPageModel';

export function ItemsPage() {
  const { t } = useTranslation('inventory');
  const model = useItemsPageModel();
  const { filters, navigate } = model;
  const hasSearchOrFilters = !!filters.search || model.hasActiveFilters;

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
      />
    </div>
  );
}
