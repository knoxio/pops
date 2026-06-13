/**
 * HTTP-JSON register handler for external pillars (Theme 13 PRD-228 US-01).
 *
 * External pillars — those that ship from a different repository and run
 * outside the in-tree `bootstrapPillar` path — register themselves with
 * `pops-core-api` by POSTing to `/core.registry.register` with the shared
 * `POPS_INTERNAL_API_KEY`. The endpoint deliberately sits OUTSIDE the
 * `/trpc/` namespace because PRD-161's nginx block explicitly blocks
 * mutating `/trpc/core.registry.*` from external traffic; PRD-228 carves
 * a sibling allow-list at `^/core\.registry\.(register|heartbeat|deregister)$`
 * for this plain HTTP-JSON surface.
 *
 * Trust model (ADR-027): the docker network is the boundary. The shared
 * key exists so an external service running outside the host cannot
 * accidentally register; it is NOT a per-pillar credential. Comparison
 * is constant-time via `crypto.timingSafeEqual` on equal-length buffers
 * so the bad-key reply does not leak character-level timing.
 *
 * Heartbeat / deregister / eviction live in US-02..04 and are NOT in
 * this PR's scope.
 */
import { pillarRegistryService, type CoreDb } from '@pops/core-db';
import { PILLARS, validateManifestPayload } from '@pops/pillar-sdk';

import { emitRegistryEvent } from '../registry/event-bus.js';
import { computeStatus, registryNow } from '../registry/status.js';
import { RegistryEntrySchema, type RegistryEntry } from '../registry/types.js';
import {
  HEARTBEAT_INTERVAL_MS,
  PILLAR_ID_PATTERN,
  constantTimeEquals,
  parseRegisterBody,
  sha256Hex,
  type ValidRegisterBody,
} from './register-helpers.js';

import type { Request, Response } from 'express';

import type { PillarRegistration } from '@pops/core-db';

const RESERVED_PILLAR_IDS: ReadonlySet<string> = new Set(PILLARS);

export interface ExternalRegisterDeps {
  readonly coreDb: CoreDb;
  /**
   * Resolves the shared internal API key at request time. Reading lazily
   * (rather than capturing at handler-construction time) lets a key
   * rotation take effect without restarting core-api in tests.
   */
  readonly resolveApiKey: () => string | undefined;
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

function rejectReservedPillarId(res: Response, pillarId: string): boolean {
  if (!RESERVED_PILLAR_IDS.has(pillarId)) return false;
  res.status(409).json({ ok: false, reason: 'pillar-id-reserved', pillarId });
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
  const { pillarId, baseUrl, manifest, apiKey } = body;
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
    apiKeyHash: sha256Hex(apiKey),
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
 * Factory for the `POST /core.registry.register` handler. The factory
 * pattern lets the test suite wire its own `resolveApiKey` callback
 * without monkey-patching `process.env`.
 */
export function createExternalRegisterHandler(deps: ExternalRegisterDeps): ExternalRegisterHandler {
  return function externalRegisterHandler(req, res) {
    const expected = deps.resolveApiKey();
    if (typeof expected !== 'string' || expected.length === 0) {
      res.status(500).json({ ok: false, reason: 'api-key-not-configured' });
      return;
    }

    const parsed = parseRegisterBody(req.body);
    if (!parsed.ok) {
      res.status(400).json({ ok: false, issues: parsed.issues });
      return;
    }

    if (!constantTimeEquals(parsed.value.apiKey, expected)) {
      res.status(401).json({ ok: false, reason: 'invalid-api-key' });
      return;
    }

    if (rejectPillarIdShape(res, parsed.value.pillarId)) return;
    if (rejectReservedPillarId(res, parsed.value.pillarId)) return;

    persistAndRespond(deps, parsed.value, res);
  };
}
