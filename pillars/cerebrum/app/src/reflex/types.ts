/**
 * Public types for the Reflex browser surface.
 *
 * App-side mirror of the server-side reflex shapes from the REST contract
 * (`pillars/cerebrum/src/contract/rest-reflex.ts`); the app does not import
 * API source directly.
 */

export const REFLEX_TRIGGER_TYPES = ['event', 'threshold', 'schedule'] as const;
export type ReflexTriggerType = (typeof REFLEX_TRIGGER_TYPES)[number];

export const REFLEX_ACTION_TYPES = ['ingest', 'emit', 'glia'] as const;
export type ReflexActionType = (typeof REFLEX_ACTION_TYPES)[number];

export const REFLEX_EXECUTION_STATUSES = ['triggered', 'executing', 'completed', 'failed'] as const;
export type ReflexExecutionStatus = (typeof REFLEX_EXECUTION_STATUSES)[number];

export interface ReflexTrigger {
  type: ReflexTriggerType;
  event?: string;
  conditions?: Record<string, unknown>;
  metric?: string;
  value?: number;
  scopes?: string[];
  cron?: string;
}

export interface ReflexAction {
  type: ReflexActionType;
  verb: string;
  template?: string;
  scopes?: string[];
  target?: string;
}

export interface ReflexWithStatus {
  name: string;
  description: string;
  enabled: boolean;
  trigger: ReflexTrigger;
  action: ReflexAction;
  lastExecutionAt: string | null;
  nextFireTime: string | null;
  executionCount: number;
}

export interface ReflexExecution {
  id: string;
  reflexName: string;
  triggerType: ReflexTriggerType;
  triggerData: Record<string, unknown> | null;
  actionType: ReflexActionType;
  actionVerb: string;
  status: ReflexExecutionStatus;
  result: Record<string, unknown> | null;
  triggeredAt: string;
  completedAt: string | null;
}
