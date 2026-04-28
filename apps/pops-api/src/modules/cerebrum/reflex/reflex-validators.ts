/**
 * Reflex trigger and action validators (PRD-089 US-01).
 */
import { CronExpressionParser } from 'cron-parser';

import { ACTION_TYPES, ENGRAM_EVENTS, KNOWN_VERBS, THRESHOLD_METRICS } from './types.js';

import type { ParseError } from './reflex-parser.js';
import type { ActionConfig, ActionType, EventTriggerConditions, TriggerConfig } from './types.js';

interface TriggerResult {
  trigger: TriggerConfig | null;
  error: ParseError | null;
}
interface ActionResult {
  action: ActionConfig | null;
  error: ParseError | null;
}

export function validateTrigger(raw: unknown, reflexName: string): TriggerResult {
  if (typeof raw !== 'object' || raw === null) {
    return {
      trigger: null,
      error: { reflexName, message: `Reflex "${reflexName}": missing required "trigger" object` },
    };
  }
  const obj = raw as Record<string, unknown>;
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
  if (typeof event !== 'string' || !(ENGRAM_EVENTS as readonly string[]).includes(event)) {
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
    trigger: {
      type: 'event',
      event: event as (typeof ENGRAM_EVENTS)[number],
      conditions: conditions ?? undefined,
    },
    error: null,
  };
}

function parseEventConditions(raw: unknown): EventTriggerConditions | null | 'error' {
  if (raw === undefined) return null;
  if (typeof raw !== 'object' || raw === null) return 'error';
  const conds = raw as Record<string, unknown>;
  const result: EventTriggerConditions = {};
  if (typeof conds['type'] === 'string') result.type = conds['type'];
  if (Array.isArray(conds['scopes'])) {
    result.scopes = (conds['scopes'] as unknown[]).filter(
      (s): s is string => typeof s === 'string'
    );
  }
  if (typeof conds['source'] === 'string') result.source = conds['source'];
  return result;
}

function validateThresholdTrigger(obj: Record<string, unknown>, reflexName: string): TriggerResult {
  const metric = obj['metric'];
  if (typeof metric !== 'string' || !(THRESHOLD_METRICS as readonly string[]).includes(metric)) {
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
  let scopes: string[] | undefined;
  if (Array.isArray(obj['scopes'])) {
    scopes = (obj['scopes'] as unknown[]).filter((s): s is string => typeof s === 'string');
  }
  return {
    trigger: {
      type: 'threshold',
      metric: metric as (typeof THRESHOLD_METRICS)[number],
      value,
      scopes,
    },
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
  const obj = raw as Record<string, unknown>;
  const type = obj['type'];
  if (typeof type !== 'string' || !(ACTION_TYPES as readonly string[]).includes(type)) {
    return {
      action: null,
      error: {
        reflexName,
        message: `Reflex "${reflexName}": action type must be one of ${ACTION_TYPES.join(', ')} — got "${String(type)}"`,
      },
    };
  }
  const actionType = type as ActionType;
  const verb = obj['verb'];
  if (typeof verb !== 'string' || verb.length === 0) {
    return {
      action: null,
      error: { reflexName, message: `Reflex "${reflexName}": action "verb" is required` },
    };
  }
  const knownVerbs = KNOWN_VERBS[actionType];
  if (!knownVerbs.includes(verb)) {
    return {
      action: null,
      error: {
        reflexName,
        message: `Reflex "${reflexName}": unknown verb "${verb}" for action type "${actionType}" — expected one of ${knownVerbs.join(', ')}`,
      },
    };
  }
  const action: ActionConfig = { type: actionType, verb };
  if (typeof obj['template'] === 'string') action.template = obj['template'];
  if (typeof obj['target'] === 'string') action.target = obj['target'];
  if (Array.isArray(obj['scopes'])) {
    action.scopes = (obj['scopes'] as unknown[]).filter((s): s is string => typeof s === 'string');
  }
  return { action, error: null };
}
