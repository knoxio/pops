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
          description:
            'Default model for AI operations that do not specify their own. Per-module overrides (e.g. cerebrum.classifier.model) still take precedence.',
          default: 'claude-haiku-4-5',
          options: [
            { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
            { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
            { value: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
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
