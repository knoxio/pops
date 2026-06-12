/**
 * Pillar registry CRUD.
 *
 * One row per pillar; the latest `register` wins (UPSERT semantics).
 * The router validates the manifest payload against PRD-157's schema
 * before calling into this service — the service trusts the shape it
 * is handed and just persists / queries.
 *
 * `registeredAt` is set on first INSERT and preserved across UPSERTs so
 * "how long has this pillar been alive?" remains answerable. Everything
 * else (manifest blob, contract metadata, heartbeat, status) is
 * overwritten on every register.
 *
 * Heartbeat lifecycle and missed-heartbeat status transitions are out
 * of scope (PRD-162); this service only ships the persistence + read
 * path.
 */
import { eq } from 'drizzle-orm';

import { pillarRegistry } from '../schema.js';

import type { CoreDb } from './internal.js';

export type PillarStatus = 'healthy' | 'unavailable' | 'unknown';

/**
 * Storage-facing manifest contract. Structurally compatible with the
 * `ManifestPayload` type from `@pops/pillar-sdk/manifest-schema` but
 * declared locally so this package does not take a dependency on the
 * SDK. Routers receive a validated `ManifestPayload` and pass it
 * through to the service.
 */
export interface PersistableManifest {
  readonly pillar: string;
  readonly contract: {
    readonly package: string;
    readonly version: string;
    readonly tag: string;
  };
}

export interface UpsertPillarRegistrationInput {
  readonly baseUrl: string;
  readonly manifest: PersistableManifest;
  readonly now?: string;
}

export interface PillarRegistration {
  readonly pillarId: string;
  readonly baseUrl: string;
  readonly manifest: unknown;
  readonly contractPackage: string;
  readonly contractVersion: string;
  readonly contractTag: string;
  readonly registeredAt: string;
  readonly lastHeartbeatAt: string;
  readonly status: PillarStatus;
  readonly statusUpdatedAt: string;
}

interface PillarRegistryRow {
  pillarId: string;
  baseUrl: string;
  manifestJson: string;
  contractPackage: string;
  contractVersion: string;
  contractTag: string;
  registeredAt: string;
  lastHeartbeatAt: string;
  status: string;
  statusUpdatedAt: string;
}

function parseStatus(raw: string): PillarStatus {
  if (raw === 'healthy' || raw === 'unavailable' || raw === 'unknown') return raw;
  return 'unknown';
}

function parseManifestBlob(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function rowToRegistration(row: PillarRegistryRow): PillarRegistration {
  return {
    pillarId: row.pillarId,
    baseUrl: row.baseUrl,
    manifest: parseManifestBlob(row.manifestJson),
    contractPackage: row.contractPackage,
    contractVersion: row.contractVersion,
    contractTag: row.contractTag,
    registeredAt: row.registeredAt,
    lastHeartbeatAt: row.lastHeartbeatAt,
    status: parseStatus(row.status),
    statusUpdatedAt: row.statusUpdatedAt,
  };
}

export function upsertPillarRegistration(
  db: CoreDb,
  input: UpsertPillarRegistrationInput
): PillarRegistration {
  const now = input.now ?? new Date().toISOString();
  const pillarId = input.manifest.pillar;
  const manifestJson = JSON.stringify(input.manifest);
  const existing = getPillarRegistration(db, pillarId);
  const registeredAt = existing?.registeredAt ?? now;

  if (existing) {
    db.update(pillarRegistry)
      .set({
        baseUrl: input.baseUrl,
        manifestJson,
        contractPackage: input.manifest.contract.package,
        contractVersion: input.manifest.contract.version,
        contractTag: input.manifest.contract.tag,
        lastHeartbeatAt: now,
        status: 'healthy',
        statusUpdatedAt: now,
      })
      .where(eq(pillarRegistry.pillarId, pillarId))
      .run();
  } else {
    db.insert(pillarRegistry)
      .values({
        pillarId,
        baseUrl: input.baseUrl,
        manifestJson,
        contractPackage: input.manifest.contract.package,
        contractVersion: input.manifest.contract.version,
        contractTag: input.manifest.contract.tag,
        registeredAt,
        lastHeartbeatAt: now,
        status: 'healthy',
        statusUpdatedAt: now,
      })
      .run();
  }

  const persisted = getPillarRegistration(db, pillarId);
  if (!persisted) {
    throw new Error(
      `pillar-registry: failed to read back registration for '${pillarId}' after upsert`
    );
  }
  return persisted;
}

export function getPillarRegistration(db: CoreDb, pillarId: string): PillarRegistration | null {
  const [row] = db.select().from(pillarRegistry).where(eq(pillarRegistry.pillarId, pillarId)).all();
  if (!row) return null;
  return rowToRegistration(row);
}

export function listPillarRegistrations(db: CoreDb): PillarRegistration[] {
  return db
    .select()
    .from(pillarRegistry)
    .orderBy(pillarRegistry.pillarId)
    .all()
    .map(rowToRegistration);
}

/**
 * Idempotent delete. Returns `true` if a row was removed, `false`
 * if the pillar was not registered.
 */
export function deletePillarRegistration(db: CoreDb, pillarId: string): boolean {
  const existed = getPillarRegistration(db, pillarId) !== null;
  if (!existed) return false;
  db.delete(pillarRegistry).where(eq(pillarRegistry.pillarId, pillarId)).run();
  return true;
}
