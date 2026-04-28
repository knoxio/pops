/**
 * Threshold trigger — evaluates Thalamus metrics and fires reflexes when
 * values cross configured thresholds (PRD-089 US-03).
 *
 * Implements edge detection (hysteresis): a threshold fires once when crossed,
 * then is suppressed until the metric drops below the threshold and crosses
 * again. This prevents the same reflex from firing every evaluation cycle
 * while the metric stays above threshold.
 */
import type { ThresholdTriggerConfig, ReflexDefinition } from '../types.js';

/**
 * Per-reflex state tracking for edge detection.
 * When `wasAbove` is true, the threshold was crossed on the last evaluation
 * and will not fire again until the metric drops below the threshold.
 */
export interface ThresholdState {
  wasAbove: boolean;
  lastValue: number | null;
  lastTriggeredAt: string | null;
}

/**
 * Evaluate a threshold reflex against the current metric value.
 *
 * Returns `true` (should fire) only on a rising-edge crossing: the metric was
 * previously at or below the threshold and is now above it.
 */
export function evaluateThreshold(
  reflex: ReflexDefinition,
  currentValue: number,
  state: ThresholdState
): { shouldFire: boolean; newState: ThresholdState } {
  if (!reflex.enabled || reflex.trigger.type !== 'threshold') {
    return { shouldFire: false, newState: state };
  }

  const trigger = reflex.trigger as ThresholdTriggerConfig;
  const isAbove = currentValue >= trigger.value;

  // Rising edge: was not above, now is.
  const shouldFire = isAbove && !state.wasAbove;

  return {
    shouldFire,
    newState: {
      wasAbove: isAbove,
      lastValue: currentValue,
      lastTriggeredAt: shouldFire ? new Date().toISOString() : state.lastTriggeredAt,
    },
  };
}

/**
 * Check whether a reflex's threshold scopes match the given engram scopes.
 * If the threshold trigger has no scopes restriction, always matches.
 */
export function matchesThresholdScopes(reflex: ReflexDefinition, engramScopes: string[]): boolean {
  if (reflex.trigger.type !== 'threshold') return false;
  const trigger = reflex.trigger as ThresholdTriggerConfig;

  if (!trigger.scopes || trigger.scopes.length === 0) return true;

  return trigger.scopes.some((pattern) => {
    if (pattern.endsWith('.*')) {
      const prefix = pattern.slice(0, -2);
      return engramScopes.some((s) => s === prefix || s.startsWith(`${prefix}.`));
    }
    return engramScopes.includes(pattern);
  });
}

/** Create initial state for a threshold-tracked reflex. */
export function createInitialThresholdState(): ThresholdState {
  return { wasAbove: false, lastValue: null, lastTriggeredAt: null };
}
