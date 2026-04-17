import {
  type ColumnFiltersState,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useState } from 'react';

import {
  dateRangeFilter,
  FilterBar,
  multiSelectFilter,
  numberRangeFilter,
} from './DataTableFilters';

import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ColumnDef, Table } from '@tanstack/react-table';

import type { ColumnFilter } from './DataTableFilters';

interface SampleRow {
  id: string;
  name: string;
  amount: number;
  category: string;
  status: string;
  date: string;
}

const sampleData: SampleRow[] = Array.from({ length: 20 }, (_, i) => ({
  id: `row-${i + 1}`,
  name: ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'][i % 5]!,
  amount: (i + 1) * 50,
  category: ['Food', 'Transport', 'Entertainment', 'Bills', 'Shopping'][i % 5]!,
  status: (['active', 'inactive', 'pending'] as const)[i % 3]!,
  date: new Date(Date.UTC(2024, Math.floor(i / 4), (i % 4) + 1)).toISOString().split('T')[0]!,
}));

const tableColumns: ColumnDef<SampleRow>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'amount', header: 'Amount', filterFn: numberRangeFilter },
  { accessorKey: 'category', header: 'Category', filterFn: multiSelectFilter },
  { accessorKey: 'status', header: 'Status', filterFn: multiSelectFilter },
  { accessorKey: 'date', header: 'Date', filterFn: dateRangeFilter },
];

const meta: Meta<typeof FilterBar> = {
  title: 'Data Display/DataTableFilters',
  component: FilterBar,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

function FilterBarDemo({
  filters,
  initialFilters = [],
}: {
  filters: ColumnFilter[];
  initialFilters?: ColumnFiltersState;
}) {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(initialFilters);

  const table = useReactTable({
    data: sampleData,
    columns: tableColumns,
    state: { columnFilters },
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const matchCount = table.getFilteredRowModel().rows.length;

  return (
    <div className="space-y-4">
      <FilterBar filters={filters} table={table as unknown as Table<unknown>} />
      <p className="text-sm text-muted-foreground">
        {matchCount} of {sampleData.length} rows match
      </p>
    </div>
  );
}

export const EmptyFilterBar: Story = {
  render: () => (
    <FilterBarDemo
      filters={[
        { id: 'name', type: 'text', label: 'Name', placeholder: 'Search by name...' },
        {
          id: 'category',
          type: 'select',
          label: 'Category',
          options: [
            { label: 'All', value: '' },
            { label: 'Food', value: 'Food' },
            { label: 'Transport', value: 'Transport' },
            { label: 'Entertainment', value: 'Entertainment' },
            { label: 'Bills', value: 'Bills' },
            { label: 'Shopping', value: 'Shopping' },
          ],
        },
      ]}
    />
  ),
};

export const SingleActiveTextFilter: Story = {
  render: () => (
    <FilterBarDemo
      filters={[
        { id: 'name', type: 'text', label: 'Name', placeholder: 'Search by name...' },
        {
          id: 'category',
          type: 'select',
          label: 'Category',
          options: [
            { label: 'All', value: '' },
            { label: 'Food', value: 'Food' },
            { label: 'Transport', value: 'Transport' },
          ],
        },
      ]}
      initialFilters={[{ id: 'name', value: 'Alpha' }]}
    />
  ),
};

export const MultipleActiveFilters: Story = {
  render: () => (
    <FilterBarDemo
      filters={[
        { id: 'name', type: 'text', label: 'Name', placeholder: 'Search by name...' },
        {
          id: 'category',
          type: 'multiselect',
          label: 'Categories',
          placeholder: 'Select categories...',
          options: [
            { label: 'Food', value: 'Food' },
            { label: 'Transport', value: 'Transport' },
            { label: 'Entertainment', value: 'Entertainment' },
            { label: 'Bills', value: 'Bills' },
            { label: 'Shopping', value: 'Shopping' },
          ],
        },
        { id: 'amount', type: 'numberrange', label: 'Amount' },
        { id: 'date', type: 'daterange', label: 'Date Range' },
      ]}
      initialFilters={[
        { id: 'category', value: ['Food', 'Transport'] },
        { id: 'amount', value: [100, 500] },
      ]}
    />
  ),
};

export const SelectFilter: Story = {
  render: () => (
    <FilterBarDemo
      filters={[
        {
          id: 'status',
          type: 'select',
          label: 'Status',
          options: [
            { label: 'All statuses', value: '' },
            { label: 'Active', value: 'active' },
            { label: 'Inactive', value: 'inactive' },
            { label: 'Pending', value: 'pending' },
          ],
        },
        {
          id: 'category',
          type: 'select',
          label: 'Category',
          options: [
            { label: 'All categories', value: '' },
            { label: 'Food', value: 'Food' },
            { label: 'Transport', value: 'Transport' },
            { label: 'Entertainment', value: 'Entertainment' },
            { label: 'Bills', value: 'Bills' },
            { label: 'Shopping', value: 'Shopping' },
          ],
        },
      ]}
    />
  ),
};

export const ClearAllBehaviour: Story = {
  render: () => (
    <FilterBarDemo
      filters={[
        { id: 'name', type: 'text', label: 'Name', placeholder: 'Search by name...' },
        {
          id: 'category',
          type: 'multiselect',
          label: 'Categories',
          placeholder: 'Select categories...',
          options: [
            { label: 'Food', value: 'Food' },
            { label: 'Transport', value: 'Transport' },
            { label: 'Entertainment', value: 'Entertainment' },
            { label: 'Bills', value: 'Bills' },
            { label: 'Shopping', value: 'Shopping' },
          ],
        },
        {
          id: 'status',
          type: 'select',
          label: 'Status',
          options: [
            { label: 'All statuses', value: '' },
            { label: 'Active', value: 'active' },
            { label: 'Inactive', value: 'inactive' },
            { label: 'Pending', value: 'pending' },
          ],
        },
      ]}
      initialFilters={[
        { id: 'name', value: 'Alpha' },
        { id: 'category', value: ['Food', 'Transport'] },
        { id: 'status', value: 'active' },
      ]}
    />
  ),
};
