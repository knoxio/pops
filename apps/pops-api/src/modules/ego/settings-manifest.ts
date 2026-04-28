/**
 * Ego settings manifest — registers conversation engine and LLM client
 * config values in the unified settings system.
 */
import type { SettingsManifest } from '@pops/types';

export const egoManifest: SettingsManifest = {
  id: 'ego',
  title: 'Ego (Conversational AI)',
  icon: 'MessageCircle',
  order: 310,
  groups: [
    {
      id: 'engine',
      title: 'Conversation Engine',
      description: 'Defaults for multi-turn conversation sessions.',
      fields: [
        {
          key: 'ego.defaultModel',
          label: 'Default Model',
          type: 'text',
          default: 'claude-sonnet-4-20250514',
          description: 'LLM model used for chat and context retrieval.',
        },
        {
          key: 'ego.maxHistory',
          label: 'Max History Messages',
          type: 'number',
          default: '20',
          description: 'Maximum conversation messages to include in context.',
          validation: { min: 1, max: 200 },
        },
        {
          key: 'ego.maxRetrieval',
          label: 'Max Retrieval Results',
          type: 'number',
          default: '5',
          description: 'Maximum engram retrieval results per turn.',
          validation: { min: 1, max: 50 },
        },
        {
          key: 'ego.tokenBudget',
          label: 'Token Budget',
          type: 'number',
          default: '4096',
          description: 'Token budget for the assembled retrieval context.',
          validation: { min: 256 },
        },
        {
          key: 'ego.relevanceThreshold',
          label: 'Relevance Threshold',
          type: 'number',
          default: '0.3',
          description: 'Minimum relevance score for retrieval results (0–1).',
          validation: { min: 0, max: 1 },
        },
      ],
    },
    {
      id: 'llm',
      title: 'LLM Parameters',
      description: 'Token limits and temperature for chat and summary calls.',
      fields: [
        {
          key: 'ego.chat.maxTokens',
          label: 'Chat Max Tokens',
          type: 'number',
          default: '2048',
          description: 'Maximum output tokens for chat responses.',
          validation: { min: 64 },
        },
        {
          key: 'ego.chat.temperature',
          label: 'Chat Temperature',
          type: 'number',
          default: '0.3',
          description: 'Sampling temperature for chat responses (0–1).',
          validation: { min: 0, max: 1 },
        },
        {
          key: 'ego.summary.maxTokens',
          label: 'Summary Max Tokens',
          type: 'number',
          default: '512',
          description: 'Maximum output tokens for history summarisation.',
          validation: { min: 64 },
        },
        {
          key: 'ego.summary.temperature',
          label: 'Summary Temperature',
          type: 'number',
          default: '0',
          description: 'Sampling temperature for history summarisation (0–1).',
          validation: { min: 0, max: 1 },
        },
      ],
    },
  ],
};
