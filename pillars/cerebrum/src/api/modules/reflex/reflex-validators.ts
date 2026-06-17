/**
 * Reflex trigger and action validators (PRD-089 US-01).
 */
import { CronExpressionParser } from 'cron-parser';

import {
  ACTION_TYPES,
  ENGRAM_EVENTS,
  KNOWN_VERBS,
  THRESHOLD_METRICS,
  type ActionConfig,
  type ActionType,
  type EngramEvent,
  type EventTriggerConditions,
  type ThresholdMetric,
  type TriggerConfig,
} from './types.js';

import type { ParseError } from './reflex-parser.js';

interface TriggerResult {
  trigger: TriggerConfig | null;
  error: ParseError | null;
}
interface ActionResult {
  action: ActionConfig | null;
  error: ParseError | null;
}

function isEngramEvent(value: unknown): value is EngramEvent {
  return typeof value === 'string' && (ENGRAM_EVENTS as readonly string[]).includes(value);
}

function isThresholdMetric(value: unknown): value is ThresholdMetric {
  return typeof value === 'string' && (THRESHOLD_METRICS as readonly string[]).includes(value);
}

function isActionType(value: unknown): value is ActionType {
  return typeof value === 'string' && (ACTION_TYPES as readonly string[]).includes(value);
}

function asStringArray(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.filter((s): s is string => typeof s === 'string');
}

export function validateTrigger(raw: unknown, reflexName: string): TriggerResult {
  if (typeof raw !== 'object' || raw === null) {
    return {
      trigger: null,
      error: { reflexName, message: `Reflex "${reflexName}": missing required "trigger" object` },
    };
  }
  const obj: Record<string, unknown> = { ...raw };
  const type = obj['type'];
  if (type === 'event') return validateEventTrigger(obj, reflexName);
  if (type === 'threshold') return validateThresholdTrigger(obj, reflexName);
  if (type === 'schedule') return validateScheduleTrigger(obj, reflexName);
  return {
    trigger: null,
    error: {
      reflexName,
      message: `Reflex "${reflexName}": trigger type must be one of event, threshold, schedule — got "${String(type)}"`,
    },
  };
}

function validateEventTrigger(obj: Record<string, unknown>, reflexName: string): TriggerResult {
  const event = obj['event'];
  if (!isEngramEvent(event)) {
    return {
      trigger: null,
      error: {
        reflexName,
        message: `Reflex "${reflexName}": event trigger "event" must be one of ${ENGRAM_EVENTS.join(', ')} — got "${String(event)}"`,
      },
    };
  }
  const conditions = parseEventConditions(obj['conditions']);
  if (conditions === 'error') {
    return {
      trigger: null,
      error: {
        reflexName,
        message: `Reflex "${reflexName}": event trigger "conditions" must be an object`,
      },
    };
  }
  return {
    trigger: { type: 'event', event, conditions: conditions ?? undefined },
    error: null,
  };
}

function parseEventConditions(raw: unknown): EventTriggerConditions | null | 'error' {
  if (raw === undefined) return null;
  if (typeof raw !== 'object' || raw === null) return 'error';
  const conds: Record<string, unknown> = { ...raw };
  const result: EventTriggerConditions = {};
  if (typeof conds['type'] === 'string') result.type = conds['type'];
  const scopes = asStringArray(conds['scopes']);
  if (scopes) result.scopes = scopes;
  if (typeof conds['source'] === 'string') result.source = conds['source'];
  return result;
}

function validateThresholdTrigger(obj: Record<string, unknown>, reflexName: string): TriggerResult {
  const metric = obj['metric'];
  if (!isThresholdMetric(metric)) {
    return {
      trigger: null,
      error: {
        reflexName,
        message: `Reflex "${reflexName}": threshold trigger "metric" must be one of ${THRESHOLD_METRICS.join(', ')} — got "${String(metric)}"`,
      },
    };
  }
  const value = obj['value'];
  if (typeof value !== 'number' || value <= 0) {
    return {
      trigger: null,
      error: {
        reflexName,
        message: `Reflex "${reflexName}": threshold trigger "value" must be a positive number — got "${String(value)}"`,
      },
    };
  }
  return {
    trigger: { type: 'threshold', metric, value, scopes: asStringArray(obj['scopes']) },
    error: null,
  };
}

function validateScheduleTrigger(obj: Record<string, unknown>, reflexName: string): TriggerResult {
  const cron = obj['cron'];
  if (typeof cron !== 'string') {
    return {
      trigger: null,
      error: {
        reflexName,
        message: `Reflex "${reflexName}": schedule trigger "cron" must be a string`,
      },
    };
  }
  const trimmed = cron.trim();
  if (!trimmed || trimmed.split(/\s+/).length !== 5) {
    return {
      trigger: null,
      error: {
        reflexName,
        message: `Reflex "${reflexName}": invalid cron expression "${cron}" — must be a 5-field cron`,
      },
    };
  }
  try {
    CronExpressionParser.parse(cron);
  } catch {
    return {
      trigger: null,
      error: { reflexName, message: `Reflex "${reflexName}": invalid cron expression "${cron}"` },
    };
  }
  return { trigger: { type: 'schedule', cron }, error: null };
}

export function validateAction(raw: unknown, reflexName: string): ActionResult {
  if (typeof raw !== 'object' || raw === null) {
    return {
      action: null,
      error: { reflexName, message: `Reflex "${reflexName}": missing required "action" object` },
    };
  }
  const obj: Record<string, unknown> = { ...raw };
  const type = obj['type'];
  if (!isActionType(type)) {
    return {
      action: null,
      error: {
        reflexName,
        message: `Reflex "${reflexName}": action type must be one of ${ACTION_TYPES.join(', ')} — got "${String(type)}"`,
      },
    };
  }
  const verb = obj['verb'];
  if (typeof verb !== 'string' || verb.length === 0) {
    return {
      action: null,
      error: { reflexName, message: `Reflex "${reflexName}": action "verb" is required` },
    };
  }
  const knownVerbs = KNOWN_VERBS[type];
  if (!knownVerbs.includes(verb)) {
    return {
      action: null,
      error: {
        reflexName,
        message: `Reflex "${reflexName}": unknown verb "${verb}" for action type "${type}" — expected one of ${knownVerbs.join(', ')}`,
      },
    };
  }
  const action: ActionConfig = { type, verb };
  if (typeof obj['template'] === 'string') action.template = obj['template'];
  if (typeof obj['target'] === 'string') action.target = obj['target'];
  const scopes = asStringArray(obj['scopes']);
  if (scopes) action.scopes = scopes;
  return { action, error: null };
}
