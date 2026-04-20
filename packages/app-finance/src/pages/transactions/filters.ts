import type { ColumnFilter } from '@pops/ui';

export const TABLE_FILTERS: ColumnFilter[] = [
  {
    id: 'account',
    type: 'select',
    label: 'Account',
    options: [
      { label: 'All Accounts', value: '' },
      { label: 'ANZ Everyday', value: 'ANZ Everyday' },
      { label: 'ANZ Savings', value: 'ANZ Savings' },
      { label: 'Amex', value: 'Amex' },
      { label: 'ING Savings', value: 'ING Savings' },
      { label: 'Up Everyday', value: 'Up Everyday' },
    ],
  },
  {
    id: 'type',
    type: 'select',
    label: 'Type',
    options: [
      { label: 'All Types', value: '' },
      { label: 'Income', value: 'Income' },
      { label: 'Expense', value: 'Expense' },
      { label: 'Transfer', value: 'Transfer' },
    ],
  },
  {
    id: 'tags',
    type: 'text',
    label: 'Tag',
    placeholder: 'Filter by tag...',
  },
];
