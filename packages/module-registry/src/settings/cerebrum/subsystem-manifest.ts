/**
 * Cerebrum settings manifest — nudges, engrams, plexus, thalamus, glia, MCP groups.
 */
import type { SettingsGroup } from '@pops/types';

export const nudgesGroup: SettingsGroup = {
  id: 'nudges',
  title: 'Nudges',
  description: 'Proactive nudge detection thresholds.',
  fields: [
    {
      key: 'cerebrum.nudge.consolidationSimilarity',
      label: 'Consolidation Similarity',
      type: 'number',
      default: '0.85',
      description: 'Minimum Thalamus similarity to propose consolidation.',
      validation: { min: 0, max: 1 },
    },
    {
      key: 'cerebrum.nudge.consolidationMinCluster',
      label: 'Consolidation Min Cluster',
      type: 'number',
      default: '3',
      validation: { min: 2 },
    },
    {
      key: 'cerebrum.nudge.stalenessDays',
      label: 'Staleness Days',
      type: 'number',
      default: '90',
      description: 'Days since modification before an engram is flagged as stale.',
      validation: { min: 1 },
    },
    {
      key: 'cerebrum.nudge.patternMinOccurrences',
      label: 'Pattern Min Occurrences',
      type: 'number',
      default: '5',
      validation: { min: 2 },
    },
    {
      key: 'cerebrum.nudge.maxPending',
      label: 'Max Pending Nudges',
      type: 'number',
      default: '20',
      validation: { min: 1 },
    },
    {
      key: 'cerebrum.nudge.cooldownHours',
      label: 'Nudge Cooldown Hours',
      type: 'number',
      default: '24',
      validation: { min: 0 },
    },
  ],
};

export const engramsGroup: SettingsGroup = {
  id: 'engrams',
  title: 'Engrams',
  fields: [
    {
      key: 'cerebrum.engram.fallbackScope',
      label: 'Fallback Scope',
      type: 'text',
      default: 'personal.captures',
      description: 'Default scope assigned when no rules or LLM inference match.',
    },
    {
      key: 'cerebrum.citation.excerptMaxLength',
      label: 'Citation Excerpt Max Length',
      type: 'number',
      default: '200',
      description: 'Maximum character length for citation excerpts.',
      validation: { min: 50 },
    },
  ],
};

export const plexusGroup: SettingsGroup = {
  id: 'plexus',
  title: 'Plexus (Adapter Lifecycle)',
  description: 'Health check interval, timeout, and failure thresholds.',
  fields: [
    {
      key: 'cerebrum.plexus.healthIntervalMs',
      label: 'Health Check Interval',
      type: 'duration',
      default: '300000',
    },
    {
      key: 'cerebrum.plexus.healthTimeoutMs',
      label: 'Health Check Timeout',
      type: 'number',
      default: '10000',
      description: 'Timeout for a single health check call (ms).',
      validation: { min: 1000 },
    },
    {
      key: 'cerebrum.plexus.maxConsecutiveFailures',
      label: 'Max Consecutive Failures',
      type: 'number',
      default: '3',
      validation: { min: 1 },
    },
  ],
};

export const thalamusGroup: SettingsGroup = {
  id: 'thalamus',
  title: 'Thalamus',
  fields: [
    {
      key: 'cerebrum.thalamus.crossSourceIntervalMs',
      label: 'Cross-Source Index Interval',
      type: 'duration',
      default: '21600000',
      description: 'Interval for the cross-source indexer job (ms). Default 6h.',
    },
  ],
};

export const gliaGroup: SettingsGroup = {
  id: 'glia',
  title: 'Glia (Trust Graduation)',
  description: 'Graduation and demotion thresholds for the Glia trust system.',
  fields: [
    {
      key: 'cerebrum.glia.proposeMinApproved',
      label: 'Propose Min Approved',
      type: 'number',
      default: '20',
      validation: { min: 1 },
    },
    {
      key: 'cerebrum.glia.proposeMaxRejectionRate',
      label: 'Propose Max Rejection Rate',
      type: 'number',
      default: '0.1',
      validation: { min: 0, max: 1 },
    },
    {
      key: 'cerebrum.glia.actReportMinDays',
      label: 'Act+Report Min Days',
      type: 'number',
      default: '60',
      validation: { min: 1 },
    },
    {
      key: 'cerebrum.glia.demotionRevertThreshold',
      label: 'Demotion Revert Threshold',
      type: 'number',
      default: '2',
      validation: { min: 1 },
    },
    {
      key: 'cerebrum.glia.demotionWindowDays',
      label: 'Demotion Window Days',
      type: 'number',
      default: '7',
      validation: { min: 1 },
    },
  ],
};

export const mcpGroup: SettingsGroup = {
  id: 'mcp',
  title: 'MCP Tools',
  description: 'Settings for Cerebrum MCP tool endpoints.',
  fields: [
    {
      key: 'cerebrum.mcp.queryMaxSources',
      label: 'MCP Query Max Sources',
      type: 'number',
      default: '3',
      validation: { min: 1, max: 50 },
    },
    {
      key: 'cerebrum.mcp.searchSnippetLength',
      label: 'MCP Search Snippet Length',
      type: 'number',
      default: '200',
      validation: { min: 50 },
    },
    {
      key: 'cerebrum.mcp.searchDefaultLimit',
      label: 'MCP Search Default Limit',
      type: 'number',
      default: '20',
      validation: { min: 1, max: 100 },
    },
  ],
};
