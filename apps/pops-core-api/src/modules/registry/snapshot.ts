/**
 * DB-backed registry snapshot for the predecessor `pops-core-api`.
 *
 * Mirrors the collapsed pillar's `GET /core.registry.list` raw route so the
 * pillar SDK's `HttpDiscoveryTransport` (which now fetches `/core.registry.list`
 * rather than `/trpc/core.registry.list`) resolves identically against either
 * surface during the migration window. Returns the bare `{ pillars, fetchedAt }`
 * body — no tRPC envelope.
 */
import { pillarRegistryService, type CoreDb, type PillarRegistration } from '@pops/core-db';

import { computeStatus, registryNow } from './status.js';
import { RegistryEntrySchema, type RegistryEntry } from './types.js';

import type { Request, Response } from 'express';

function liveStatus(reg: PillarRegistration, now: Date): RegistryEntry['status'] {
  if (reg.status === 'unknown') return 'unknown';
  return computeStatus(new Date(reg.lastHeartbeatAt), now);
}

function toRegistryEntry(reg: PillarRegistration, now: Date): RegistryEntry {
  const manifest = RegistryEntrySchema.shape.manifest.parse(reg.manifest);
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
    status: liveStatus(reg, now),
    statusUpdatedAt: reg.statusUpdatedAt,
  };
}

export function createRegistrySnapshotHandler(db: CoreDb): (req: Request, res: Response) => void {
  return function registrySnapshotHandler(_req: Request, res: Response): void {
    const now = registryNow();
    res.json({
      pillars: pillarRegistryService
        .listPillarRegistrations(db)
        .map((row) => toRegistryEntry(row, now)),
      fetchedAt: now.toISOString(),
    });
  };
}
