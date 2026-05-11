/**
 * Pure helpers for summarising a reflex trigger/action into a short label.
 *
 * Extracted from the list/detail pages so they can be reused (and tested)
 * without dragging in React. The caller supplies the translator (the
 * `t` returned by `useTranslation('cerebrum')`) so the labels stay
 * localized across pt-BR / en-AU instead of leaking English strings.
 */
import type { ReflexAction, ReflexTrigger } from './types';

export type TriggerTranslator = (key: string, vars?: Record<string, string>) => string;

const UNKNOWN_PLACEHOLDER = '?';

export function summariseTrigger(trigger: ReflexTrigger, t: TriggerTranslator): string {
  switch (trigger.type) {
    case 'event':
      return t('reflex.trigger.event', { event: trigger.event ?? UNKNOWN_PLACEHOLDER });
    case 'threshold':
      return t('reflex.trigger.threshold', {
        metric: trigger.metric ?? UNKNOWN_PLACEHOLDER,
        value: String(trigger.value ?? UNKNOWN_PLACEHOLDER),
      });
    case 'schedule':
      return t('reflex.trigger.schedule', { cron: trigger.cron ?? UNKNOWN_PLACEHOLDER });
  }
}

export function summariseAction(action: ReflexAction, t: TriggerTranslator): string {
  return t('reflex.action.summary', { type: action.type, verb: action.verb });
}
