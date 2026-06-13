/**
 * HTTP-JSON heartbeat handler for external pillars (Theme 13 PRD-228 US-02).
 *
 * External pillars POST to `/core.registry.heartbeat` with their
 * `pillarId` + the shared `POPS_INTERNAL_API_KEY`. Two auth gates:
 *
 *   1. Constant-time `apiKey` compare against the shared env (layer 1).
 *   2. `sha256(apiKey)` compare against the stored `apiKeyHash` on the
 *      row (layer 2 — catches key rotation where the env was rotated
 *      but the pillar still holds the old value).
 *
 * Both failures return the same 401 `invalid-api-key` reason so callers
 * cannot probe which gate failed.
 *
 * Soft failure (rather than 404) on missing row: PRD-228 acceptance
 * criterion is `{ ok: false, reason: 'not-registered' }` with a 200,
 * so the external SDK can re-register cleanly without parsing HTTP
 * status codes. This matches the in-network tRPC heartbeat (PRD-162).
 */
import { pillarRegistryService, type CoreDb } from '@pops/core-db';

import { emitRegistryEvent } from '../registry/event-bus.js';
import { registryNow } from '../registry/status.js';
import { constantTimeEquals, sha256Hex } from './auth.js';
import { parseHeartbeatBody, type ValidHeartbeatBody } from './heartbeat-helpers.js';

import type { Request, Response } from 'express';

import type { PillarRegistration } from '@pops/core-db';

export interface ExternalHeartbeatDeps {
  readonly coreDb: CoreDb;
  readonly resolveApiKey: () => string | undefined;
}

export type ExternalHeartbeatHandler = (req: Request, res: Response) => void;

function rejectInvalidKey(res: Response): void {
  res.status(401).json({ ok: false, reason: 'invalid-api-key' });
}

function rejectNotRegistered(res: Response): void {
  res.status(200).json({ ok: false, reason: 'not-registered' });
}

function applyHeartbeat(
  deps: ExternalHeartbeatDeps,
  existing: PillarRegistration,
  res: Response
): void {
  const result = pillarRegistryService.recordHeartbeat(deps.coreDb, existing.pillarId, {
    now: registryNow().toISOString(),
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

function authorize(
  deps: ExternalHeartbeatDeps,
  body: ValidHeartbeatBody,
  expected: string
): { ok: true; existing: PillarRegistration } | { ok: false } {
  if (!constantTimeEquals(body.apiKey, expected)) return { ok: false };
  const existing = pillarRegistryService.getPillarRegistration(deps.coreDb, body.pillarId);
  if (!existing) return { ok: false };
  if (existing.apiKeyHash === null) return { ok: false };
  if (!constantTimeEquals(sha256Hex(body.apiKey), existing.apiKeyHash)) return { ok: false };
  return { ok: true, existing };
}

/**
 * Factory for the `POST /core.registry.heartbeat` handler. Factory
 * pattern mirrors the register handler so the test suite can inject
 * `resolveApiKey` without touching `process.env`.
 */
export function createExternalHeartbeatHandler(
  deps: ExternalHeartbeatDeps
): ExternalHeartbeatHandler {
  return function externalHeartbeatHandler(req, res) {
    const expected = deps.resolveApiKey();
    if (typeof expected !== 'string' || expected.length === 0) {
      res.status(500).json({ ok: false, reason: 'api-key-not-configured' });
      return;
    }

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
      if (!constantTimeEquals(parsed.value.apiKey, expected)) {
        rejectInvalidKey(res);
        return;
      }
      rejectNotRegistered(res);
      return;
    }

    const auth = authorize(deps, parsed.value, expected);
    if (!auth.ok) {
      rejectInvalidKey(res);
      return;
    }

    applyHeartbeat(deps, auth.existing, res);
  };
}
