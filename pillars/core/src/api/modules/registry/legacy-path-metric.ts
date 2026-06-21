/**
 * Legacy registry-path-hit instrumentation for the dot-routes → slash rollout.
 *
 * During the rolling-deploy window core dual-serves each registry operation on
 * both its canonical slash path ({@link REGISTRY_PATHS}) and the legacy dotted
 * path ({@link LEGACY_REGISTRY_PATHS}). This middleware is a dependency-light
 * pass-through that records EVERY request landing on a legacy dotted path, then
 * calls `next()` unchanged.
 *
 * The hit COUNT gates the eventual legacy-path removal: once it reads zero
 * across every core instance, no pillar image is still dialing the dotted shape
 * and the aliases can be dropped. So every hit is counted — but the `warn` is
 * throttled to at most one per path per {@link WARN_WINDOW_MS} window. Without
 * the throttle a single still-old pillar heartbeating at
 * {@link HEARTBEAT_INTERVAL_MS} would emit a `warn` every 10s per core instance
 * for the whole dual-serve window, flooding logs and tripping warn-based alerts.
 * Each emitted record carries the suppressed-hit count accumulated since the
 * previous emit for that path, so the aggregate signal is never lost.
 *
 * The throttle state is bounded by the legacy-path set (one counter entry per
 * dotted path), so it cannot grow unbounded. The middleware never reads
 * `req.body`, never blocks, and adds a single set-membership check per request.
 */
import { LEGACY_REGISTRY_PATHS } from '@pops/pillar-sdk';

import { logger } from '../../shared/logger.js';

import type { NextFunction, Request, Response } from 'express';

const LEGACY_PATHS: ReadonlySet<string> = new Set(Object.values(LEGACY_REGISTRY_PATHS));

/** Minimum wall-clock gap between two emitted `warn`s for the same legacy path. */
export const WARN_WINDOW_MS = 5 * 60 * 1000;

/** A `warn`/`next`-only middleware shaped like the Express ones core mounts. */
export type LegacyPathMetricMiddleware = (req: Request, res: Response, next: NextFunction) => void;

/** Structured-log sink the metric writes to. Defaults to the core pino logger. */
export interface LegacyPathMetricSink {
  warn(payload: Record<string, unknown>, message: string): void;
}

/** Wall-clock source in epoch millis. Defaults to `Date.now`; injectable for tests. */
export type MetricClock = () => number;

/** Per-path throttle bookkeeping: when we last emitted, and hits suppressed since. */
interface PathWindow {
  lastEmitMs: number;
  suppressed: number;
}

/** Options for {@link makeLegacyPathMetric}. */
export interface LegacyPathMetricOptions {
  /**
   * Structured-log sink; defaults to the shared core logger so a call site can
   * mount `makeLegacyPathMetric()` with no arguments and tests can inject a
   * recording sink to assert emit cadence and aggregated counts.
   */
  readonly sink?: LegacyPathMetricSink;
  /** Wall-clock source; defaults to `Date.now`. Tests inject a controllable clock. */
  readonly clock?: MetricClock;
  /** Minimum gap between emitted warns per path; defaults to {@link WARN_WINDOW_MS}. */
  readonly windowMs?: number;
}

const WARN_MESSAGE =
  'registry legacy dotted path hit (slash form is canonical; legacy removed in a later release)';

/**
 * Build the legacy-path-hit metric middleware.
 *
 * Counts every hit but emits at most one `warn` per legacy path per window. The
 * throttle state lives in this closure (one entry per legacy path), so it is
 * bounded and reset per middleware instance.
 *
 * @param options - injectable sink / clock / window; all optional.
 */
export function makeLegacyPathMetric(
  options: LegacyPathMetricOptions = {}
): LegacyPathMetricMiddleware {
  const sink = options.sink ?? logger;
  const clock = options.clock ?? Date.now;
  const windowMs = options.windowMs ?? WARN_WINDOW_MS;
  const windows = new Map<string, PathWindow>();

  return function legacyPathMetric(req, _res, next): void {
    const path = req.path;
    if (LEGACY_PATHS.has(path)) {
      const now = clock();
      const window = windows.get(path);
      if (window === undefined || now - window.lastEmitMs >= windowMs) {
        sink.warn(
          {
            event: 'registry.legacy_path_hit',
            path,
            method: req.method,
            suppressedSinceLastWarn: window?.suppressed ?? 0,
          },
          WARN_MESSAGE
        );
        windows.set(path, { lastEmitMs: now, suppressed: 0 });
      } else {
        window.suppressed += 1;
      }
    }
    next();
  };
}
