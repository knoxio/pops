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
 * `recordHeartbeat` updates `lastHeartbeatAt` and resets `status` →
 * `healthy`; `applyStatusUpdates` lets the registry's reconciliation
 * tick (PRD-162) batch transition pillars to `unavailable` once their
 * heartbeat has lapsed past threshold. The "should this pillar still
 * be healthy?" decision lives in the router (`computeStatus`), not in
 * this service — keeping the persistence layer agnostic.
 */
import { eq, sql } from 'drizzle-orm';

import { pillarRegistry } from '../schema.js';

import type { CoreDb } from './internal.js';

export type PillarStatus = 'healthy' | 'unavailable' | 'unknown';

/** PRD-228: `'internal'` is the bootstrap path; `'external'` is HTTP-key registration. */
export type PillarOrigin = 'internal' | 'external';

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
  /** Defaults to `'internal'` (bootstrap path); HTTP endpoint passes `'external'`. */
  readonly origin?: PillarOrigin;
  /**
   * SHA-256 hex of the API key. Historical column; new external
   * registrations pass `null` since the trust model is the docker
   * network (ADR-027) rather than per-request key auth.
   */
  readonly apiKeyHash?: string | null;
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
  readonly origin: PillarOrigin;
  readonly apiKeyHash: string | null;
  readonly evictedAt: string | null;
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
  origin: string;
  apiKeyHash: string | null;
  evictedAt: string | null;
}

function parseStatus(raw: string): PillarStatus {
  if (raw === 'healthy' || raw === 'unavailable' || raw === 'unknown') return raw;
  return 'unknown';
}

function parseOrigin(raw: string): PillarOrigin {
  return raw === 'external' ? 'external' : 'internal';
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
    origin: parseOrigin(row.origin),
    apiKeyHash: row.apiKeyHash,
    evictedAt: row.evictedAt,
  };
}

export function upsertPillarRegistration(
  db: CoreDb,
  input: UpsertPillarRegistrationInput
): PillarRegistration {
  const now = input.now ?? new Date().toISOString();
  const pillarId = input.manifest.pillar;
  const manifestJson = JSON.stringify(input.manifest);
  const origin: PillarOrigin = input.origin ?? 'internal';
  const apiKeyHash = origin === 'external' ? (input.apiKeyHash ?? null) : null;

  db.insert(pillarRegistry)
    .values({
      pillarId,
      baseUrl: input.baseUrl,
      manifestJson,
      contractPackage: input.manifest.contract.package,
      contractVersion: input.manifest.contract.version,
      contractTag: input.manifest.contract.tag,
      registeredAt: now,
      lastHeartbeatAt: now,
      status: 'healthy',
      statusUpdatedAt: now,
      origin,
      apiKeyHash,
      evictedAt: null,
    })
    .onConflictDoUpdate({
      target: pillarRegistry.pillarId,
      set: {
        baseUrl: sql`excluded.base_url`,
        manifestJson: sql`excluded.manifest_json`,
        contractPackage: sql`excluded.contract_package`,
        contractVersion: sql`excluded.contract_version`,
        contractTag: sql`excluded.contract_tag`,
        lastHeartbeatAt: sql`excluded.last_heartbeat_at`,
        status: sql`excluded.status`,
        statusUpdatedAt: sql`excluded.status_updated_at`,
        origin: sql`excluded.origin`,
        apiKeyHash: sql`excluded.api_key_hash`,
        evictedAt: sql`excluded.evicted_at`,
      },
    })
    .run();

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
 * if the pillar was not registered. Atomic — relies on the DELETE's
 * `changes` count rather than a read-then-delete.
 */
export function deletePillarRegistration(db: CoreDb, pillarId: string): boolean {
  const result = db.delete(pillarRegistry).where(eq(pillarRegistry.pillarId, pillarId)).run();
  return result.changes > 0;
}

export interface HeartbeatResult {
  readonly recorded: boolean;
  readonly registration: PillarRegistration | null;
  readonly previousStatus: PillarStatus | null;
  readonly statusChanged: boolean;
}

/**
 * Idempotent heartbeat ingest (Theme 13 PRD-162).
 *
 * Updates `lastHeartbeatAt = now` and resets `status = 'healthy'` for
 * the addressed pillar. Returns `recorded: false` if the pillar is not
 * registered (cold registry, restart, deregistered). The router treats
 * that as a soft signal — pillars retry on the next tick.
 *
 * `statusChanged` is true when this heartbeat flipped the persisted
 * status (e.g. `unavailable → healthy`). `statusUpdatedAt` is rewritten
 * only on a transition; a healthy-to-healthy heartbeat leaves it as is.
 * The background ticker handles the healthy-staleness refresh.
 */
export function recordHeartbeat(
  db: CoreDb,
  pillarId: string,
  options?: { now?: string }
): HeartbeatResult {
  const existing = getPillarRegistration(db, pillarId);
  if (!existing) {
    return { recorded: false, registration: null, previousStatus: null, statusChanged: false };
  }
  const now = options?.now ?? new Date().toISOString();
  const previousStatus = existing.status;
  const statusChanged = previousStatus !== 'healthy';

  db.update(pillarRegistry)
    .set({
      lastHeartbeatAt: now,
      status: 'healthy',
      ...(statusChanged ? { statusUpdatedAt: now } : {}),
    })
    .where(eq(pillarRegistry.pillarId, pillarId))
    .run();

  const updated = getPillarRegistration(db, pillarId);
  return {
    recorded: true,
    registration: updated,
    previousStatus,
    statusChanged,
  };
}

export type { ApplyStatusUpdate, StatusTransition } from './pillar-registry-status.js';
export { applyStatusUpdates } from './pillar-registry-status.js';
