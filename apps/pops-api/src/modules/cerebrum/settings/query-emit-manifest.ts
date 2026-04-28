/**
 * Cerebrum settings manifest — query engine and document generation groups.
 */
import type { SettingsGroup } from '@pops/types';

export const queryGroup: SettingsGroup = {
  id: 'query',
  title: 'Query Engine',
  description: 'Natural-language Q&A pipeline settings.',
  fields: [
    {
      key: 'cerebrum.query.model',
      label: 'Query Model',
      type: 'text',
      default: 'claude-sonnet-4-20250514',
      description: 'LLM model used for Q&A answer generation.',
    },
    {
      key: 'cerebrum.query.maxSources',
      label: 'Max Sources',
      type: 'number',
      default: '10',
      description: 'Maximum number of sources to retrieve per query.',
      validation: { min: 1, max: 100 },
    },
    {
      key: 'cerebrum.query.relevanceThreshold',
      label: 'Relevance Threshold',
      type: 'number',
      default: '0.3',
      description: 'Minimum relevance score for retrieved sources (0-1).',
      validation: { min: 0, max: 1 },
    },
    {
      key: 'cerebrum.query.tokenBudget',
      label: 'Token Budget',
      type: 'number',
      default: '4096',
      description: 'Maximum tokens for the context window passed to the LLM.',
      validation: { min: 256 },
    },
  ],
};

export const emitGroup: SettingsGroup = {
  id: 'emit',
  title: 'Document Generation',
  description: 'Report, summary, and timeline generation settings.',
  fields: [
    {
      key: 'cerebrum.emit.model',
      label: 'Generation Model',
      type: 'text',
      default: 'claude-sonnet-4-20250514',
      description: 'LLM model used for document generation.',
    },
    {
      key: 'cerebrum.emit.maxTokens',
      label: 'Generation Max Tokens',
      type: 'number',
      default: '2048',
      description: 'Maximum tokens for LLM document generation output.',
      validation: { min: 256 },
    },
    {
      key: 'cerebrum.emit.relevanceThreshold',
      label: 'Relevance Threshold',
      type: 'number',
      default: '0.2',
      description: 'Minimum relevance score for emit retrieval (0-1).',
      validation: { min: 0, max: 1 },
    },
    {
      key: 'cerebrum.emit.maxSources',
      label: 'Max Sources',
      type: 'number',
      default: '20',
      description: 'Maximum sources retrieved for document generation.',
      validation: { min: 1, max: 200 },
    },
    {
      key: 'cerebrum.emit.tokenBudget',
      label: 'Token Budget',
      type: 'number',
      default: '8192',
      description: 'Token budget for the assembled context window.',
      validation: { min: 256 },
    },
  ],
};
