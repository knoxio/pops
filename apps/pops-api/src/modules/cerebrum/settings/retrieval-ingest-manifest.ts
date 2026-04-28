/**
 * Cerebrum settings manifest — retrieval and ingest pipeline groups.
 */
import type { SettingsGroup } from '@pops/types';

export const retrievalGroup: SettingsGroup = {
  id: 'retrieval',
  title: 'Retrieval',
  description: 'Semantic search, hybrid search, and context assembly settings.',
  fields: [
    {
      key: 'cerebrum.semantic.defaultLimit',
      label: 'Semantic Default Limit',
      type: 'number',
      default: '20',
      description: 'Default number of results from semantic search.',
      validation: { min: 1, max: 200 },
    },
    {
      key: 'cerebrum.semantic.defaultThreshold',
      label: 'Semantic Default Threshold',
      type: 'number',
      default: '0.8',
      description: 'Default distance threshold for semantic search (0-1).',
      validation: { min: 0, max: 1 },
    },
    {
      key: 'cerebrum.semantic.queryCacheTtl',
      label: 'Query Cache TTL (seconds)',
      type: 'number',
      default: '300',
      description: 'Time-to-live for cached query embeddings in Redis.',
      validation: { min: 0 },
    },
    {
      key: 'cerebrum.hybrid.rrfK',
      label: 'RRF K Constant',
      type: 'number',
      default: '60',
      description: 'Reciprocal Rank Fusion K constant for merging results.',
      validation: { min: 1 },
    },
    {
      key: 'cerebrum.hybrid.defaultLimit',
      label: 'Hybrid Default Limit',
      type: 'number',
      default: '20',
      description: 'Default number of results from hybrid search.',
      validation: { min: 1, max: 200 },
    },
    {
      key: 'cerebrum.hybrid.defaultThreshold',
      label: 'Hybrid Default Threshold',
      type: 'number',
      default: '0.8',
      description: 'Default distance threshold for hybrid search (0-1).',
      validation: { min: 0, max: 1 },
    },
    {
      key: 'cerebrum.context.tokenBudget',
      label: 'Context Assembly Token Budget',
      type: 'number',
      default: '4096',
      description: 'Default token budget for context assembly.',
      validation: { min: 256 },
    },
  ],
};

export const ingestGroup: SettingsGroup = {
  id: 'ingest',
  title: 'Ingest Pipeline',
  description: 'Classifier, entity extractor, and scope inference settings.',
  fields: [
    {
      key: 'cerebrum.classifier.model',
      label: 'Classifier Model',
      type: 'text',
      default: 'claude-haiku-4-5-20251001',
      description: 'LLM model used for content classification.',
    },
    {
      key: 'cerebrum.classifier.confidenceThreshold',
      label: 'Classifier Confidence Threshold',
      type: 'number',
      default: '0.6',
      description: 'Minimum confidence to accept a classification (0-1).',
      validation: { min: 0, max: 1 },
    },
    {
      key: 'cerebrum.entityExtractor.model',
      label: 'Entity Extractor Model',
      type: 'text',
      default: 'claude-haiku-4-5-20251001',
      description: 'LLM model used for entity extraction.',
    },
    {
      key: 'cerebrum.entityExtractor.confidenceThreshold',
      label: 'Entity Extractor Confidence Threshold',
      type: 'number',
      default: '0.7',
      description: 'Minimum confidence for extracted entities (0-1).',
      validation: { min: 0, max: 1 },
    },
    {
      key: 'cerebrum.scopeInference.model',
      label: 'Scope Inference Model',
      type: 'text',
      default: 'claude-haiku-4-5-20251001',
      description: 'LLM model used for scope inference.',
    },
  ],
};
