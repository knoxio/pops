/**
 * HTTP-JSON heartbeat handler for external pillars (Theme 13 PRD-228 US-02).
 *
 * External pillars POST to `/core.registry.heartbeat` with their
 * `pillarId`. Trust model (ADR-027): the docker network is the boundary;
 * anything able to reach this endpoint is already inside the compose
 * network.
 *
 * Soft failure (rather than 404) on missing row: PRD-228 acceptance
 * criterion is `{ ok: false, reason: 'not-registered' }` with a 200,
 * so the external SDK can re-register cleanly without parsing HTTP
 * status codes. This matches the in-network tRPC heartbeat (PRD-162).
 */
import { pillarRegistryService, type CoreDb } from '../../../db/index.js';
import { emitRegistryEvent } from '../registry/event-bus.js';
import { registryNow } from '../registry/status.js';
import { parseHeartbeatBody } from './heartbeat-helpers.js';

import type { Request, Response } from 'express';

import type { CapabilityStatuses, PillarRegistration } from '../../../db/index.js';

export interface ExternalHeartbeatDeps {
  readonly coreDb: CoreDb;
}

export type ExternalHeartbeatHandler = (req: Request, res: Response) => void;

function rejectNotRegistered(res: Response): void {
  res.status(200).json({ ok: false, reason: 'not-registered' });
}

function applyHeartbeat(
  deps: ExternalHeartbeatDeps,
  existing: PillarRegistration,
  capabilities: CapabilityStatuses | undefined,
  res: Response
): void {
  const result = pillarRegistryService.recordHeartbeat(deps.coreDb, existing.pillarId, {
    now: registryNow().toISOString(),
    ...(capabilities === undefined ? {} : { capabilities }),
  });
  if (!result.recorded || !result.registration) {
    rejectNotRegistered(res);
    return;
  }

  if (result.statusChanged) {
    emitRegistryEvent({
      event: 'health-changed',
      pillarId: result.registration.pillarId,
      entry: null,
      origin: result.registration.origin,
    });
  }

  res.status(200).json({
    ok: true,
    pillarId: result.registration.pillarId,
    lastHeartbeatAt: result.registration.lastHeartbeatAt,
    status: result.registration.status,
    statusChanged: result.statusChanged,
  });
}

/**
 * Factory for the `POST /core.registry.heartbeat` handler.
 */
export function createExternalHeartbeatHandler(
  deps: ExternalHeartbeatDeps
): ExternalHeartbeatHandler {
  return function externalHeartbeatHandler(req, res) {
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
      rejectNotRegistered(res);
      return;
    }

    applyHeartbeat(deps, existing, parsed.value.capabilities, res);
  };
}
