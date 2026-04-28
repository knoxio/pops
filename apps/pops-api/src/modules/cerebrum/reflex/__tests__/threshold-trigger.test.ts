import { describe, expect, it } from 'vitest';

import {
  evaluateThreshold,
  matchesThresholdScopes,
  createInitialThresholdState,
} from '../triggers/threshold-trigger.js';

import type { ThresholdState } from '../triggers/threshold-trigger.js';
import type { ReflexDefinition } from '../types.js';

function makeThresholdReflex(overrides?: Partial<ReflexDefinition>): ReflexDefinition {
  return {
    name: 'threshold-test',
    description: 'Test threshold',
    enabled: true,
    trigger: {
      type: 'threshold',
      metric: 'similar_count',
      value: 10,
    },
    action: { type: 'glia', verb: 'consolidate' },
    ...overrides,
  };
}

describe('evaluateThreshold', () => {
  it('fires on first crossing above threshold', () => {
    const reflex = makeThresholdReflex();
    const state = createInitialThresholdState();

    const result = evaluateThreshold(reflex, 12, state);

    expect(result.shouldFire).toBe(true);
    expect(result.newState.wasAbove).toBe(true);
    expect(result.newState.lastValue).toBe(12);
    expect(result.newState.lastTriggeredAt).not.toBeNull();
  });

  it('fires when value equals threshold exactly', () => {
    const reflex = makeThresholdReflex();
    const state = createInitialThresholdState();

    const result = evaluateThreshold(reflex, 10, state);

    expect(result.shouldFire).toBe(true);
  });

  it('does not fire when value is below threshold', () => {
    const reflex = makeThresholdReflex();
    const state = createInitialThresholdState();

    const result = evaluateThreshold(reflex, 8, state);

    expect(result.shouldFire).toBe(false);
    expect(result.newState.wasAbove).toBe(false);
  });

  it('does not re-fire while metric stays above threshold (hysteresis)', () => {
    const reflex = makeThresholdReflex();
    const state: ThresholdState = {
      wasAbove: true,
      lastValue: 12,
      lastTriggeredAt: '2026-01-01T00:00:00Z',
    };

    const result = evaluateThreshold(reflex, 15, state);

    expect(result.shouldFire).toBe(false);
    expect(result.newState.wasAbove).toBe(true);
    expect(result.newState.lastValue).toBe(15);
  });

  it('fires again after metric drops below and rises above threshold', () => {
    const reflex = makeThresholdReflex();

    // First: above threshold
    let state = createInitialThresholdState();
    const r1 = evaluateThreshold(reflex, 12, state);
    expect(r1.shouldFire).toBe(true);
    state = r1.newState;

    // Stays above: no fire
    const r2 = evaluateThreshold(reflex, 14, state);
    expect(r2.shouldFire).toBe(false);
    state = r2.newState;

    // Drops below
    const r3 = evaluateThreshold(reflex, 7, state);
    expect(r3.shouldFire).toBe(false);
    state = r3.newState;
    expect(state.wasAbove).toBe(false);

    // Rises above again: fires
    const r4 = evaluateThreshold(reflex, 11, state);
    expect(r4.shouldFire).toBe(true);
    expect(r4.newState.wasAbove).toBe(true);
  });

  it('does not fire for disabled reflexes', () => {
    const reflex = makeThresholdReflex({ enabled: false });
    const state = createInitialThresholdState();

    const result = evaluateThreshold(reflex, 100, state);

    expect(result.shouldFire).toBe(false);
  });

  it('does not fire for non-threshold trigger types', () => {
    const reflex = makeThresholdReflex({
      trigger: { type: 'schedule', cron: '0 8 * * 0' },
    });
    const state = createInitialThresholdState();

    const result = evaluateThreshold(reflex, 100, state);

    expect(result.shouldFire).toBe(false);
  });
});

describe('matchesThresholdScopes', () => {
  it('matches when no scopes restriction (all match)', () => {
    const reflex = makeThresholdReflex({
      trigger: { type: 'threshold', metric: 'similar_count', value: 10 },
    });

    expect(matchesThresholdScopes(reflex, ['anything'])).toBe(true);
  });

  it('matches when scope prefix matches', () => {
    const reflex = makeThresholdReflex({
      trigger: {
        type: 'threshold',
        metric: 'similar_count',
        value: 10,
        scopes: ['work.*'],
      },
    });

    expect(matchesThresholdScopes(reflex, ['work.projects'])).toBe(true);
  });

  it('matches when scope exactly matches prefix root', () => {
    const reflex = makeThresholdReflex({
      trigger: {
        type: 'threshold',
        metric: 'similar_count',
        value: 10,
        scopes: ['work.*'],
      },
    });

    expect(matchesThresholdScopes(reflex, ['work'])).toBe(true);
  });

  it('does not match when no scopes overlap', () => {
    const reflex = makeThresholdReflex({
      trigger: {
        type: 'threshold',
        metric: 'similar_count',
        value: 10,
        scopes: ['work.*'],
      },
    });

    expect(matchesThresholdScopes(reflex, ['personal.journal'])).toBe(false);
  });

  it('returns false for non-threshold trigger type', () => {
    const reflex = makeThresholdReflex({
      trigger: { type: 'schedule', cron: '0 * * * *' },
    });

    expect(matchesThresholdScopes(reflex, ['work'])).toBe(false);
  });
});
