import type { SettingsManifest } from '@pops/types';

export const aiConfigManifest: SettingsManifest = {
  id: 'ai.config',
  title: 'AI Configuration',
  icon: 'Bot',
  order: 200,
  groups: [
    {
      id: 'model',
      title: 'Model',
      fields: [
        {
          key: 'ai.model',
          label: 'AI Model',
          type: 'select',
          default: 'claude-haiku-4-5-20251001',
          options: [
            {
              value: 'claude-haiku-4-5-20251001',
              label: 'Claude Haiku (claude-haiku-4-5-20251001)',
            },
          ],
        },
      ],
    },
    {
      id: 'budget',
      title: 'Budget',
      fields: [
        {
          key: 'ai.monthlyTokenBudget',
          label: 'Monthly Token Budget',
          type: 'number',
          description: 'Maximum tokens to use per month. Leave empty for no limit.',
          validation: { min: 0 },
        },
        {
          key: 'ai.budgetExceededFallback',
          label: 'When Budget Exceeded',
          type: 'select',
          default: 'skip',
          options: [
            { value: 'skip', label: 'Skip requests' },
            { value: 'alert', label: 'Alert and continue' },
          ],
        },
      ],
    },
  ],
};
