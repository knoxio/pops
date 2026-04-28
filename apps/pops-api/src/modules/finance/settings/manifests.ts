import type { SettingsManifest } from '@pops/types';

export const financeManifest: SettingsManifest = {
  id: 'finance',
  title: 'Finance',
  icon: 'DollarSign',
  order: 300,
  groups: [
    {
      id: 'ai-categorizer',
      title: 'AI Categorizer',
      description: 'Claude model and token settings for transaction entity matching.',
      fields: [
        {
          key: 'finance_ai_categorizer_model',
          label: 'Model',
          type: 'select',
          default: 'claude-haiku-4-5-20251001',
          options: [
            {
              value: 'claude-haiku-4-5-20251001',
              label: 'Claude Haiku (claude-haiku-4-5-20251001)',
            },
          ],
        },
        {
          key: 'finance_ai_categorizer_max_tokens',
          label: 'Max Tokens',
          type: 'number',
          default: '200',
          description: 'Maximum tokens for AI categorization responses.',
          validation: { min: 50, max: 4096 },
        },
      ],
    },
    {
      id: 'imports',
      title: 'Imports',
      fields: [
        {
          key: 'finance_import_cleanup_delay_ms',
          label: 'Progress Cleanup Delay (ms)',
          type: 'number',
          default: '300000',
          description: 'Milliseconds before import progress entries expire from memory.',
          validation: { min: 10000 },
        },
      ],
    },
    {
      id: 'pagination',
      title: 'Pagination Defaults',
      description: 'Default page size for finance list endpoints.',
      fields: [
        {
          key: 'finance_transactions_default_limit',
          label: 'Transactions',
          type: 'number',
          default: '50',
          validation: { min: 1, max: 500 },
        },
        {
          key: 'finance_budgets_default_limit',
          label: 'Budgets',
          type: 'number',
          default: '50',
          validation: { min: 1, max: 500 },
        },
        {
          key: 'finance_wishlist_default_limit',
          label: 'Wishlist',
          type: 'number',
          default: '50',
          validation: { min: 1, max: 500 },
        },
      ],
    },
  ],
};
