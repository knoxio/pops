/**
 * Unit tests for the throttled legacy-path-hit metric (registry-cleanup Phase 1).
 *
 * The dual-serve window can run for days while old pillars heartbeat at the 10s
 * cadence. The metric must keep the gating signal accurate — count EVERY hit —
 * while never emitting more than one `warn` per legacy path per window, folding
 * the suppressed-hit count into the next emitted record. These tests drive an
 * injected clock so window boundaries are exercised without real time, and an
 * injected recording sink so emit cadence and payloads are asserted directly.
 */
import { describe, expect, it } from 'vitest';

import { LEGACY_REGISTRY_PATHS, REGISTRY_PATHS } from '@pops/pillar-sdk';

import {
  makeLegacyPathMetric,
  WARN_WINDOW_MS,
  type LegacyPathMetricSink,
} from '../legacy-path-metric.js';

import type { Request, Response } from 'express';

interface WarnRecord {
  payload: Record<string, unknown>;
  message: string;
}

function recordingSink(): { sink: LegacyPathMetricSink; records: WarnRecord[] } {
  const records: WarnRecord[] = [];
  return {
    records,
    sink: {
      warn(payload, message): void {
        records.push({ payload, message });
      },
    },
  };
}

function mutableClock(start = 0): { now: () => number; advance: (ms: number) => void } {
  let current = start;
  return {
    now: () => current,
    advance: (ms) => {
      current += ms;
    },
  };
}

function hit(
  middleware: (req: Request, res: Response, next: () => void) => void,
  path: string,
  method = 'POST'
): boolean {
  let nextCalled = false;
  const req = { path, method } as unknown as Request;
  const res = {} as Response;
  middleware(req, res, () => {
    nextCalled = true;
  });
  return nextCalled;
}

const LEGACY = LEGACY_REGISTRY_PATHS.heartbeat;

describe('makeLegacyPathMetric throttle', () => {
  it('always calls next() and never emits on canonical slash paths', () => {
    const { sink, records } = recordingSink();
    const middleware = makeLegacyPathMetric({ sink, clock: mutableClock().now });

    for (const path of Object.values(REGISTRY_PATHS)) {
      expect(hit(middleware, path)).toBe(true);
    }

    expect(records).toHaveLength(0);
  });

  it('emits once per path on the first hit with a zero suppressed count', () => {
    const { sink, records } = recordingSink();
    const middleware = makeLegacyPathMetric({ sink, clock: mutableClock().now });

    expect(hit(middleware, LEGACY)).toBe(true);

    expect(records).toHaveLength(1);
    expect(records[0]?.payload).toMatchObject({
      event: 'registry.legacy_path_hit',
      path: LEGACY,
      method: 'POST',
      suppressedSinceLastWarn: 0,
    });
  });

  it('counts every hit but emits at most one warn per window per path', () => {
    const { sink, records } = recordingSink();
    const clock = mutableClock();
    const middleware = makeLegacyPathMetric({ sink, clock: clock.now });

    const totalHits = 50;
    for (let i = 0; i < totalHits; i += 1) {
      expect(hit(middleware, LEGACY)).toBe(true);
      clock.advance(WARN_WINDOW_MS / 100);
    }

    expect(records).toHaveLength(1);
  });

  it('re-emits after the window elapses, carrying the suppressed count', () => {
    const { sink, records } = recordingSink();
    const clock = mutableClock();
    const middleware = makeLegacyPathMetric({ sink, clock: clock.now });

    hit(middleware, LEGACY);

    const suppressedHits = 12;
    for (let i = 0; i < suppressedHits; i += 1) {
      clock.advance(1000);
      hit(middleware, LEGACY);
    }

    clock.advance(WARN_WINDOW_MS);
    hit(middleware, LEGACY);

    expect(records).toHaveLength(2);
    expect(records[0]?.payload.suppressedSinceLastWarn).toBe(0);
    expect(records[1]?.payload.suppressedSinceLastWarn).toBe(suppressedHits);
  });

  it('resets the suppressed count to zero after each emit', () => {
    const { sink, records } = recordingSink();
    const clock = mutableClock();
    const middleware = makeLegacyPathMetric({ sink, clock: clock.now });

    hit(middleware, LEGACY);
    hit(middleware, LEGACY);
    hit(middleware, LEGACY);

    clock.advance(WARN_WINDOW_MS);
    hit(middleware, LEGACY);

    clock.advance(WARN_WINDOW_MS);
    hit(middleware, LEGACY);

    expect(records).toHaveLength(3);
    expect(records[1]?.payload.suppressedSinceLastWarn).toBe(2);
    expect(records[2]?.payload.suppressedSinceLastWarn).toBe(0);
  });

  it('throttles each legacy path on its own independent window', () => {
    const { sink, records } = recordingSink();
    const clock = mutableClock();
    const middleware = makeLegacyPathMetric({ sink, clock: clock.now });

    const register = LEGACY_REGISTRY_PATHS.register;
    const heartbeat = LEGACY_REGISTRY_PATHS.heartbeat;

    hit(middleware, register);
    hit(middleware, register);
    hit(middleware, heartbeat);
    hit(middleware, heartbeat);

    expect(records).toHaveLength(2);
    const warnedPaths = records.map((r) => r.payload.path);
    expect(warnedPaths).toContain(register);
    expect(warnedPaths).toContain(heartbeat);
  });

  it('honors a custom window', () => {
    const { sink, records } = recordingSink();
    const clock = mutableClock();
    const middleware = makeLegacyPathMetric({ sink, clock: clock.now, windowMs: 1000 });

    hit(middleware, LEGACY);
    clock.advance(999);
    hit(middleware, LEGACY);
    clock.advance(1);
    hit(middleware, LEGACY);

    expect(records).toHaveLength(2);
    expect(records[1]?.payload.suppressedSinceLastWarn).toBe(1);
  });
});
