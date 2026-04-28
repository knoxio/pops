/**
 * Finance settings manifest — AI categorizer and pagination defaults.
 */
import type { SettingsManifest } from '@pops/types';

export const financeManifest: SettingsManifest = {
  id: 'finance',
  title: 'Finance',
  icon: 'DollarSign',
  order: 140,
  groups: [
    {
      id: 'aiCategorizer',
      title: 'AI Categorizer',
      description: 'Model and limits for AI-powered transaction categorisation.',
      fields: [
        {
          key: 'finance.aiCategorizer.model',
          label: 'Categorizer Model',
          type: 'text',
          default: 'claude-haiku-4-5-20251001',
          description: 'LLM model used for entity matching.',
        },
        {
          key: 'finance.aiCategorizer.maxTokens',
          label: 'Max Tokens',
          type: 'number',
          default: '200',
          description: 'Maximum output tokens per categorisation call.',
          validation: { min: 50, max: 2000 },
        },
        {
          key: 'finance.ruleGen.model',
          label: 'Rule Generation Model',
          type: 'text',
          default: 'claude-haiku-4-5-20251001',
          description: 'LLM model for correction rule analysis.',
        },
        {
          key: 'finance.ruleGen.maxTokens',
          label: 'Rule Gen Max Tokens',
          type: 'number',
          default: '200',
          validation: { min: 50, max: 2000 },
        },
      ],
    },
    {
      id: 'financePagination',
      title: 'Pagination',
      description: 'Default page sizes for finance list endpoints.',
      fields: [
        {
          key: 'finance.defaultLimit',
          label: 'Default Page Size',
          type: 'number',
          default: '50',
          description: 'Default page size for transactions, budgets, and wishlist.',
          validation: { min: 1, max: 200 },
        },
      ],
    },
  ],
};
