/**
 * Legacy registry-path-hit instrumentation for the dot-routes → slash rollout.
 *
 * During the rolling-deploy window core dual-serves each registry operation on
 * both its canonical slash path ({@link REGISTRY_PATHS}) and the legacy dotted
 * path ({@link LEGACY_REGISTRY_PATHS}). This middleware is a dependency-light
 * pass-through that emits ONE structured `warn`-level record whenever a request
 * lands on a legacy dotted path, then calls `next()` unchanged.
 *
 * The signal gates the eventual legacy-path removal: once this counter reads
 * zero across every core instance, no pillar image is still dialing the dotted
 * shape and the aliases can be dropped. It never reads `req.body`, never blocks,
 * and adds a single set-membership check per request — cheap enough to mount in
 * front of every dual-served handler.
 */
import { LEGACY_REGISTRY_PATHS } from '@pops/pillar-sdk';

import { logger } from '../../shared/logger.js';

import type { NextFunction, Request, Response } from 'express';

const LEGACY_PATHS: ReadonlySet<string> = new Set(Object.values(LEGACY_REGISTRY_PATHS));

/** A `warn`/`next`-only middleware shaped like the Express ones core mounts. */
export type LegacyPathMetricMiddleware = (req: Request, res: Response, next: NextFunction) => void;

/** Structured-log sink the metric writes to. Defaults to the core pino logger. */
export interface LegacyPathMetricSink {
  warn(payload: Record<string, unknown>, message: string): void;
}

/**
 * Build the legacy-path-hit metric middleware.
 *
 * @param sink - structured-log sink; defaults to the shared core logger so a
 *   call site can mount `makeLegacyPathMetric()` with no arguments and tests
 *   can inject a recording sink to assert the hit fires on dotted paths only.
 */
export function makeLegacyPathMetric(
  sink: LegacyPathMetricSink = logger
): LegacyPathMetricMiddleware {
  return function legacyPathMetric(req, _res, next): void {
    if (LEGACY_PATHS.has(req.path)) {
      sink.warn(
        { event: 'registry.legacy_path_hit', path: req.path, method: req.method },
        'registry legacy dotted path hit (slash form is canonical; legacy removed in a later release)'
      );
    }
    next();
  };
}
