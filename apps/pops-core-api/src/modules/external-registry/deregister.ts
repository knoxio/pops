/**
 * HTTP-JSON deregister handler for external pillars (Theme 13 PRD-228 US-04).
 *
 * An external pillar shutting down cleanly POSTs to
 * `/core.registry.deregister` so the dispatcher can drop its route
 * immediately, rather than waiting for the missed-heartbeat → unavailable
 * → eviction chain to land.
 *
 * Behaviour:
 *   - Trust model (ADR-027): the docker network is the boundary.
 *   - DELETE is idempotent: a missing row returns `{ ok: true }` with
 *     no event emitted (acceptance criterion).
 *   - On a real DELETE a `{ event: 'deregistered', reason: 'requested' }`
 *     payload fires on the PRD-163 bus.
 *   - Refuses to delete `origin = 'internal'` rows — an in-network caller
 *     should not be able to nuke an in-tree pillar by accident.
 */
import { pillarRegistryService, type CoreDb } from '@pops/core-db';

import { emitRegistryEvent } from '../registry/event-bus.js';
import { parseHeartbeatBody } from './heartbeat-helpers.js';

import type { Request, Response } from 'express';

import type { PillarRegistration } from '@pops/core-db';

export interface ExternalDeregisterDeps {
  readonly coreDb: CoreDb;
}

export type ExternalDeregisterHandler = (req: Request, res: Response) => void;

function rejectInternal(res: Response): void {
  res.status(403).json({
    ok: false,
    reason: 'internal-pillar-not-deregisterable-externally',
  });
}

function performDelete(deps: ExternalDeregisterDeps, existing: PillarRegistration): void {
  pillarRegistryService.deletePillarRegistration(deps.coreDb, existing.pillarId);
  emitRegistryEvent({
    event: 'deregistered',
    pillarId: existing.pillarId,
    entry: null,
    origin: existing.origin,
    reason: 'requested',
  });
}

export function createExternalDeregisterHandler(
  deps: ExternalDeregisterDeps
): ExternalDeregisterHandler {
  return function externalDeregisterHandler(req, res) {
    const parsed = parseHeartbeatBody(req.body);
    if (!parsed.ok) {
      res.status(400).json({ ok: false, issues: parsed.issues });
      return;
    }

    const existing = pillarRegistryService.getPillarRegistration(
      deps.coreDb,
      parsed.value.pillarId
    );
    if (!existing) {
      res.status(200).json({ ok: true, removed: false });
      return;
    }

    if (existing.origin === 'internal') {
      rejectInternal(res);
      return;
    }

    performDelete(deps, existing);
    res.status(200).json({ ok: true, removed: true });
  };
}
