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
            'Default model for AI operations that do not specify their own. Per-pipeline overrides below still take precedence.',
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
      id: 'modelOverrides',
      title: 'Per-Pipeline Model Overrides',
      description:
        'Override the global AI Model on a per-pipeline basis. Leave empty to use the global model. Replaces the former cerebrum.*.model keys.',
      fields: [
        {
          key: 'ai.modelOverrides.query',
          label: 'Query (Q&A)',
          type: 'text',
          description: 'Model for the cerebrum Query Engine answer generation.',
        },
        {
          key: 'ai.modelOverrides.emit',
          label: 'Document Generation',
          type: 'text',
          description: 'Model for the cerebrum Emit document generation pipeline.',
        },
        {
          key: 'ai.modelOverrides.classifier',
          label: 'Content Classifier',
          type: 'text',
          description: 'Model for the cerebrum ingest content classifier.',
        },
        {
          key: 'ai.modelOverrides.entityExtractor',
          label: 'Entity Extractor',
          type: 'text',
          description: 'Model for the cerebrum ingest entity extractor.',
        },
        {
          key: 'ai.modelOverrides.scopeInference',
          label: 'Scope Inference',
          type: 'text',
          description: 'Model for the cerebrum ingest scope inferencer.',
        },
        {
          key: 'ai.modelOverrides.auditorContradiction',
          label: 'Contradiction Auditor',
          type: 'text',
          description: 'Model for the cerebrum auditor contradiction detector.',
        },
        {
          key: 'ai.modelOverrides.patternContradiction',
          label: 'Pattern Contradiction Analyzer',
          type: 'text',
          description:
            'Model for the cerebrum pattern-detection contradiction analyzer (PRD-084 US-03).',
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
    {
      id: 'retention',
      title: 'Log Retention',
      fields: [
        {
          key: 'ai.logRetentionDays',
          label: 'Inference Log Retention (days)',
          type: 'number',
          description:
            'How many days of raw `ai_inference_log` rows to keep. Older rows are aggregated into `ai_inference_daily` and removed by the nightly retention job.',
          default: '90',
          validation: { min: 1 },
        },
      ],
    },
  ],
};
