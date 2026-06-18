import { validateManifestPayload } from '@pops/pillar-sdk';

/**
 * HTTP-JSON register handler for external pillars (Theme 13 PRD-228 US-01).
 *
 * External pillars — those that ship from a different repository and run
 * outside the in-tree `bootstrapPillar` path — register themselves with
 * `pops-core-api` by POSTing to `/core.registry.register`. The endpoint
 * deliberately sits OUTSIDE the `/trpc/` namespace because PRD-161's
 * nginx block explicitly blocks mutating `/trpc/core.registry.*` from
 * external traffic; PRD-228 carves a sibling allow-list at
 * `^/core\.registry\.(register|heartbeat|deregister)$` for this plain
 * HTTP-JSON surface.
 *
 * Trust model (ADR-027): the docker network is the boundary. Anything
 * able to POST here is already inside the compose network — the
 * external-vs-internal distinction is captured by the `origin` column,
 * not by per-request authentication.
 *
 * Heartbeat / deregister / eviction live in US-02..04.
 */
import { pillarRegistryService, type CoreDb } from '../../../db/index.js';
import { emitRegistryEvent } from '../registry/event-bus.js';
import { computeStatus, registryNow } from '../registry/status.js';
import { RegistryEntrySchema, type RegistryEntry } from '../registry/types.js';
import {
  HEARTBEAT_INTERVAL_MS,
  PILLAR_ID_PATTERN,
  parseRegisterBody,
  type ValidRegisterBody,
} from './register-helpers.js';

import type { Request, Response } from 'express';

import type { PillarRegistration } from '../../../db/index.js';

export interface ExternalRegisterDeps {
  readonly coreDb: CoreDb;
}

function toRegistryEntry(reg: PillarRegistration, now: Date): RegistryEntry {
  const manifest = RegistryEntrySchema.shape.manifest.parse(reg.manifest);
  const status =
    reg.status === 'unknown' ? 'unknown' : computeStatus(new Date(reg.lastHeartbeatAt), now);
  return {
    pillarId: reg.pillarId,
    baseUrl: reg.baseUrl,
    manifest,
    contract: {
      package: reg.contractPackage,
      version: reg.contractVersion,
      tag: reg.contractTag,
    },
    registeredAt: reg.registeredAt,
    lastHeartbeatAt: reg.lastHeartbeatAt,
    status,
    statusUpdatedAt: reg.statusUpdatedAt,
  };
}

function rejectPillarIdShape(res: Response, pillarId: string): boolean {
  if (PILLAR_ID_PATTERN.test(pillarId)) return false;
  res.status(400).json({
    ok: false,
    issues: [
      {
        field: 'pillarId',
        reason: `pillarId must match ${PILLAR_ID_PATTERN.toString()}`,
        got: pillarId,
        schemaPath: ['pillarId'],
      },
    ],
  });
  return true;
}

function rejectManifestPillarMismatch(
  res: Response,
  pillarId: string,
  manifestPillar: string
): boolean {
  if (manifestPillar === pillarId) return false;
  res.status(400).json({
    ok: false,
    issues: [
      {
        field: 'manifest.pillar',
        reason: 'manifest.pillar must equal pillarId',
        got: manifestPillar,
        schemaPath: ['manifest', 'pillar'],
      },
    ],
  });
  return true;
}

function persistAndRespond(
  deps: ExternalRegisterDeps,
  body: ValidRegisterBody,
  res: Response
): void {
  const { pillarId, baseUrl, manifest } = body;
  const validation = validateManifestPayload(manifest);
  if (!validation.ok) {
    res.status(400).json({ ok: false, issues: validation.issues });
    return;
  }
  if (rejectManifestPillarMismatch(res, pillarId, validation.payload.pillar)) return;

  const now = registryNow();
  const persisted = pillarRegistryService.upsertPillarRegistration(deps.coreDb, {
    baseUrl,
    manifest: validation.payload,
    now: now.toISOString(),
    origin: 'external',
    apiKeyHash: null,
  });

  const entry = toRegistryEntry(persisted, now);
  emitRegistryEvent({ event: 'registered', pillarId: entry.pillarId, entry });

  res.status(200).json({
    ok: true,
    pillarId: persisted.pillarId,
    registeredAt: persisted.registeredAt,
    heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
  });
}

export type ExternalRegisterHandler = (req: Request, res: Response) => void;

/**
 * Factory for the `POST /core.registry.register` handler.
 */
export function createExternalRegisterHandler(deps: ExternalRegisterDeps): ExternalRegisterHandler {
  return function externalRegisterHandler(req, res) {
    const parsed = parseRegisterBody(req.body);
    if (!parsed.ok) {
      res.status(400).json({ ok: false, issues: parsed.issues });
      return;
    }

    if (rejectPillarIdShape(res, parsed.value.pillarId)) return;

    persistAndRespond(deps, parsed.value, res);
  };
}
