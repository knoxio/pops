/**
 * DB-backed registry snapshot — the discovery surface every pillar reads.
 *
 * Served as a raw Express route, mounted on both `GET /registry/pillars` and
 * the legacy `GET /core.registry.list` (see `../../app.ts`). The registry wire
 * is raw HTTP/SSE, not a ts-rest shape — the response body is the bare
 * `{ pillars, fetchedAt }` object, which the pillar SDK's discovery transport
 * reads directly.
 *
 * Status is computed live from `lastHeartbeatAt` on every read (`computeStatus`)
 * so consumers see the freshest state even if the background ticker lags.
 * `toRegistryEntry` is the single projection shared by the snapshot route, the
 * raw register handler, and the SSE subscribe stream.
 */
import {
  pillarRegistryService,
  type CoreDb,
  type PillarRegistration,
  type PillarStatus,
} from '../../../db/index.js';
import { computeStatus, registryNow } from './status.js';
import { RegistryEntrySchema, type RegistryEntry } from './types.js';

import type { Request, Response } from 'express';

function liveStatus(reg: PillarRegistration, now: Date): PillarStatus {
  if (reg.status === 'unknown') return 'unknown';
  return computeStatus(new Date(reg.lastHeartbeatAt), now);
}

/** Project a persisted registration row onto the public registry-entry wire shape. */
export function toRegistryEntry(reg: PillarRegistration, now: Date): RegistryEntry {
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
    ...(reg.capabilities === null ? {} : { capabilities: reg.capabilities }),
  };
}

export interface RegistrySnapshot {
  pillars: RegistryEntry[];
  fetchedAt: string;
}

/** Build the full DB-backed registry snapshot with live status. */
export function buildRegistrySnapshot(db: CoreDb, now: Date = registryNow()): RegistrySnapshot {
  const rows = pillarRegistryService.listPillarRegistrations(db);
  return {
    pillars: rows.map((row) => toRegistryEntry(row, now)),
    fetchedAt: now.toISOString(),
  };
}

/**
 * Raw registry-snapshot handler, mounted on both `GET /registry/pillars` and
 * the legacy `GET /core.registry.list`. Returns the bare snapshot the pillar
 * SDK's `HttpDiscoveryTransport` consumes — discovery stays raw HTTP.
 */
export function createRegistrySnapshotHandler(db: CoreDb): (req: Request, res: Response) => void {
  return function registrySnapshotHandler(_req: Request, res: Response): void {
    res.json(buildRegistrySnapshot(db));
  };
}
