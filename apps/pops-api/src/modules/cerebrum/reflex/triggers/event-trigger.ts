/**
 * Event trigger — matches engram lifecycle events against reflex conditions
 * and dispatches matching actions (PRD-089 US-02).
 *
 * The event trigger is a pure matching function. The actual event bus
 * subscription and action dispatch are handled by the ReflexService.
 */
import type { EngramEventPayload, EventTriggerConfig, ReflexDefinition } from '../types.js';

/**
 * Check whether an event payload matches a reflex's event trigger conditions.
 *
 * Returns `true` when:
 * 1. The reflex is enabled and has an event trigger.
 * 2. The event type matches the trigger's configured event.
 * 3. All optional conditions are satisfied (type, scopes prefix, source).
 */
export function matchesEventTrigger(
  reflex: ReflexDefinition,
  payload: EngramEventPayload
): boolean {
  if (!reflex.enabled) return false;
  if (reflex.trigger.type !== 'event') return false;

  const trigger = reflex.trigger as EventTriggerConfig;
  if (trigger.event !== payload.event) return false;

  const conditions = trigger.conditions;
  if (!conditions) return true;

  if (conditions.type !== undefined && conditions.type !== payload.engramType) {
    return false;
  }

  if (conditions.source !== undefined && conditions.source !== payload.source) {
    return false;
  }

  if (conditions.scopes !== undefined && conditions.scopes.length > 0) {
    const matches = conditions.scopes.some((pattern) => {
      if (pattern.endsWith('.*')) {
        const prefix = pattern.slice(0, -2);
        return payload.scopes.some((s) => s === prefix || s.startsWith(`${prefix}.`));
      }
      return payload.scopes.includes(pattern);
    });
    if (!matches) return false;
  }

  return true;
}

/**
 * Resolve template variables in action config strings using the event payload.
 *
 * Supported variables:
 * - `{{engram_id}}` → payload.engramId
 * - `{{engram_type}}` → payload.engramType
 * - `{{engram_scopes}}` → comma-separated scopes
 */
export function resolveTemplateVariables(template: string, payload: EngramEventPayload): string {
  return template
    .replace(/\{\{engram_id\}\}/g, payload.engramId)
    .replace(/\{\{engram_type\}\}/g, payload.engramType)
    .replace(/\{\{engram_scopes\}\}/g, payload.scopes.join(','));
}
