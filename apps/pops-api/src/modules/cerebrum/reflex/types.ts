/**
 * Reflex system types (PRD-089).
 *
 * Reflexes are declarative trigger-action rules defined in `reflexes.toml`.
 * Three trigger types (event, threshold, schedule) fire actions dispatched
 * to existing subsystems (Ingest, Emit, Glia).
 */

// ---------------------------------------------------------------------------
// Trigger types
// ---------------------------------------------------------------------------

export const ENGRAM_EVENTS = [
  'engram.created',
  'engram.modified',
  'engram.archived',
  'engram.linked',
] as const;
export type EngramEvent = (typeof ENGRAM_EVENTS)[number];

export const THRESHOLD_METRICS = ['similar_count', 'staleness_max', 'topic_frequency'] as const;
export type ThresholdMetric = (typeof THRESHOLD_METRICS)[number];

export interface EventTriggerConditions {
  type?: string;
  scopes?: string[];
  source?: string;
}

export interface EventTriggerConfig {
  type: 'event';
  event: EngramEvent;
  conditions?: EventTriggerConditions;
}

export interface ThresholdTriggerConfig {
  type: 'threshold';
  metric: ThresholdMetric;
  value: number;
  scopes?: string[];
}

export interface ScheduleTriggerConfig {
  type: 'schedule';
  cron: string;
}

export type TriggerConfig = EventTriggerConfig | ThresholdTriggerConfig | ScheduleTriggerConfig;
export type TriggerType = TriggerConfig['type'];

// ---------------------------------------------------------------------------
// Action types
// ---------------------------------------------------------------------------

export const ACTION_TYPES = ['ingest', 'emit', 'glia'] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const GLIA_VERBS = ['prune', 'consolidate', 'link', 'audit'] as const;
export const EMIT_VERBS = ['generate'] as const;
export const INGEST_VERBS = ['classify', 'ingest'] as const;

export type GliaVerb = (typeof GLIA_VERBS)[number];
export type EmitVerb = (typeof EMIT_VERBS)[number];
export type IngestVerb = (typeof INGEST_VERBS)[number];

export interface ActionConfig {
  type: ActionType;
  verb: string;
  template?: string;
  scopes?: string[];
  target?: string;
}

// ---------------------------------------------------------------------------
// Reflex definition
// ---------------------------------------------------------------------------

export interface ReflexDefinition {
  name: string;
  description: string;
  enabled: boolean;
  trigger: TriggerConfig;
  action: ActionConfig;
}

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------

export type ExecutionStatus = 'triggered' | 'executing' | 'completed' | 'failed';

export interface ReflexExecution {
  id: string;
  reflexName: string;
  triggerType: TriggerType;
  triggerData: Record<string, unknown> | null;
  actionType: ActionType;
  actionVerb: string;
  status: ExecutionStatus;
  result: Record<string, unknown> | null;
  triggeredAt: string;
  completedAt: string | null;
}

/** Runtime-enriched reflex returned by the list/get API. */
export interface ReflexWithStatus extends ReflexDefinition {
  lastExecutionAt: string | null;
  nextFireTime: string | null;
  executionCount: number;
}

// ---------------------------------------------------------------------------
// Event bus payload
// ---------------------------------------------------------------------------

export interface EngramEventPayload {
  event: EngramEvent;
  engramId: string;
  engramType: string;
  scopes: string[];
  source: string;
  changes?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Verb lookup
// ---------------------------------------------------------------------------

/** Map from action type to its known verbs. */
export const KNOWN_VERBS: Record<ActionType, readonly string[]> = {
  glia: GLIA_VERBS,
  emit: EMIT_VERBS,
  ingest: INGEST_VERBS,
};
