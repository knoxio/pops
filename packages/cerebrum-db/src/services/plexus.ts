/**
 * Plexus data-access for the cerebrum pillar (PRD-180 US-01).
 *
 * Scope boundary: this file is the SQL seam for the plexus slice. It covers
 * adapter CRUD on `plexus_adapters` (list / get / upsert / status mutators
 * / counter bumps / hard-delete) and the bounded filter operations on
 * `plexus_filters` (list / replace / cascade-delete with the parent
 * adapter). The TOML config loader, the per-adapter HTTP clients (Notion /
 * Linear / etc.), the `PlexusLifecycle` orchestration in pops-api that
 * runs ingest / emit / health-check pipelines, plus the envelope
 * encryption of the `config` blob all stay in
 * `apps/pops-api/src/modules/cerebrum/plexus/*` until PRD-180 US-03 flips
 * routing through `getCerebrumDrizzle()`. That keeps this package pure
 * data-access — no node:fs imports, no TOML, no domain orchestration.
 *
 * The functions take a `CerebrumDb` handle as their first argument; the
 * calling layer (pops-api today, `cerebrum-api` after the cutover)
 * resolves the singleton or transaction handle. Mirrors the
 * `nudge-log.ts` / `engrams.ts` / `glia.ts` db-arg pattern in this
 * package.
 */
import { and, asc, eq, sql } from 'drizzle-orm';

import { plexusAdapters, plexusFilters } from '../schema.js';
import { PlexusAdapterNameConflictError, PlexusAdapterNotFoundError } from './plexus-errors.js';
import { parseAdapterConfig, rowToAdapter, rowToFilter } from './plexus-helpers.js';

import type { CerebrumDb } from './internal.js';
import type {
  PlexusAdapter,
  PlexusAdapterStatus,
  PlexusFilter,
  PlexusFilterDefinition,
  UpsertAdapterArgs,
} from './plexus-types.js';

export { parseAdapterConfig, rowToAdapter, rowToFilter };

/** List every registered adapter, ordered by name (matches the live router). */
export function listAdapters(db: CerebrumDb): PlexusAdapter[] {
  return db.select().from(plexusAdapters).orderBy(asc(plexusAdapters.name)).all().map(rowToAdapter);
}

/** Fetch a single adapter by id. Returns null when missing. */
export function getAdapter(db: CerebrumDb, adapterId: string): PlexusAdapter | null {
  const row = db.select().from(plexusAdapters).where(eq(plexusAdapters.id, adapterId)).get();
  return row ? rowToAdapter(row) : null;
}

/**
 * Strict variant of `getAdapter` — raises `PlexusAdapterNotFoundError`
 * when the row is missing. Used by routes that should 404 immediately
 * rather than thread a nullable through the handler.
 */
export function getAdapterOrThrow(db: CerebrumDb, adapterId: string): PlexusAdapter {
  const adapter = getAdapter(db, adapterId);
  if (!adapter) throw new PlexusAdapterNotFoundError(adapterId);
  return adapter;
}

/** Lookup by name — used by the TOML loader's reconcile step. */
export function getAdapterByName(db: CerebrumDb, name: string): PlexusAdapter | null {
  const row = db.select().from(plexusAdapters).where(eq(plexusAdapters.name, name)).get();
  return row ? rowToAdapter(row) : null;
}

/**
 * Idempotently register an adapter. On conflict the row resets to
 * `status='registered'`, clears `last_error`, and overwrites `config` +
 * `updated_at`. `created_at` is only set on insert. Mirrors the
 * `lifecycle-db.upsertAdapterRow` SQL used in pops-api today; the
 * encrypted config envelope is passed straight through as JSON.
 *
 * Raises `PlexusAdapterNameConflictError` if a different id already
 * owns the same `name` (the unique index would otherwise surface as a
 * raw SQLITE_CONSTRAINT, which leaks the implementation).
 */
export function upsertAdapter(db: CerebrumDb, args: UpsertAdapterArgs): PlexusAdapter {
  const existingByName = getAdapterByName(db, args.name);
  if (existingByName && existingByName.id !== args.id) {
    throw new PlexusAdapterNameConflictError(args.name);
  }
  const serialisedConfig = args.config != null ? JSON.stringify(args.config) : null;
  db.insert(plexusAdapters)
    .values({
      id: args.id,
      name: args.name,
      status: 'registered',
      config: serialisedConfig,
      lastHealth: null,
      lastError: null,
      ingestedCount: 0,
      emittedCount: 0,
      createdAt: args.createdAt,
      updatedAt: args.updatedAt,
    })
    .onConflictDoUpdate({
      target: plexusAdapters.id,
      set: {
        name: args.name,
        status: 'registered',
        config: serialisedConfig,
        lastError: null,
        updatedAt: args.updatedAt,
      },
    })
    .run();
  return getAdapterOrThrow(db, args.id);
}

/**
 * Patch payload for `updateAdapterStatus`. `lastError` is cleared
 * whenever it is omitted or explicitly null (the implementation
 * normalises both via `?? null`); pass a non-empty string to record a
 * fresh failure.
 */
export interface AdapterStatusPatch {
  status: PlexusAdapterStatus;
  updatedAt: string;
  lastError?: string | null;
}

/**
 * Update the lifecycle `status` (and optional `last_error`) of an existing
 * adapter. Returns the resulting row or null when the adapter has been
 * deleted in flight. `updatedAt` is required on the patch so the caller
 * controls the clock.
 */
export function updateAdapterStatus(
  db: CerebrumDb,
  adapterId: string,
  patch: AdapterStatusPatch
): PlexusAdapter | null {
  db.update(plexusAdapters)
    .set({ status: patch.status, lastError: patch.lastError ?? null, updatedAt: patch.updatedAt })
    .where(eq(plexusAdapters.id, adapterId))
    .run();
  return getAdapter(db, adapterId);
}

/**
 * Stamp `last_health` on a successful health-check. Both `last_health`
 * and `updated_at` are set to the same timestamp so the caller doesn't
 * have to thread two clocks through the call site.
 */
export function recordAdapterHealth(
  db: CerebrumDb,
  adapterId: string,
  at: string
): PlexusAdapter | null {
  db.update(plexusAdapters)
    .set({ lastHealth: at, updatedAt: at })
    .where(eq(plexusAdapters.id, adapterId))
    .run();
  return getAdapter(db, adapterId);
}

/** Argument bundle for `incrementAdapterCounter`. */
export interface AdapterCounterBump {
  counter: 'ingestedCount' | 'emittedCount';
  delta: number;
  updatedAt: string;
}

/**
 * Atomically increment the `ingested_count` (or `emitted_count`) counter
 * for an adapter. Used by the lifecycle manager's ingest / emit pipelines
 * after a successful batch. `updatedAt` is bumped in the same statement so
 * the row's mtime always tracks its busiest counter.
 */
export function incrementAdapterCounter(
  db: CerebrumDb,
  adapterId: string,
  bump: AdapterCounterBump
): void {
  const column = plexusAdapters[bump.counter];
  db.update(plexusAdapters)
    .set({ [bump.counter]: sql`${column} + ${bump.delta}`, updatedAt: bump.updatedAt })
    .where(eq(plexusAdapters.id, adapterId))
    .run();
}

/**
 * Hard-delete an adapter row. The FK on `plexus_filters.adapter_id`
 * cascades, so the filters disappear in the same statement when foreign
 * keys are enabled on the connection. Returns the number of rows actually
 * deleted (0 if the id was already gone — caller can treat this as
 * idempotent).
 */
export function deleteAdapter(db: CerebrumDb, adapterId: string): number {
  return db.delete(plexusAdapters).where(eq(plexusAdapters.id, adapterId)).run().changes;
}

/** List filters for an adapter, ordered by id (matches the live router). */
export function listFilters(db: CerebrumDb, adapterId: string): PlexusFilter[] {
  return db
    .select()
    .from(plexusFilters)
    .where(eq(plexusFilters.adapterId, adapterId))
    .orderBy(asc(plexusFilters.id))
    .all()
    .map(rowToFilter);
}

/** List only the enabled filters for an adapter — the lifecycle ingest path. */
export function listEnabledFilters(db: CerebrumDb, adapterId: string): PlexusFilter[] {
  return db
    .select()
    .from(plexusFilters)
    .where(and(eq(plexusFilters.adapterId, adapterId), eq(plexusFilters.enabled, 1)))
    .orderBy(asc(plexusFilters.id))
    .all()
    .map(rowToFilter);
}

/**
 * Atomically replace every filter for an adapter. Wraps the
 * delete-then-insert in a transaction so the lifecycle manager never
 * observes a partial filter set mid-replace. Generates surrogate ids of
 * the form `pxf_{adapterId}_{index}` so the rows are deterministic and
 * the row order matches the input.
 *
 * Raises `PlexusAdapterNotFoundError` when the parent adapter is missing
 * so the caller doesn't silently orphan filter rules under a phantom id.
 */
export function setFilters(
  db: CerebrumDb,
  adapterId: string,
  filters: readonly PlexusFilterDefinition[]
): PlexusFilter[] {
  if (!getAdapter(db, adapterId)) throw new PlexusAdapterNotFoundError(adapterId);
  db.transaction((tx) => {
    tx.delete(plexusFilters).where(eq(plexusFilters.adapterId, adapterId)).run();
    if (filters.length === 0) return;
    const values = filters.map((f, i) => ({
      id: `pxf_${adapterId}_${i}`,
      adapterId,
      filterType: f.filterType,
      field: f.field,
      pattern: f.pattern,
      enabled: f.enabled === false ? 0 : 1,
    }));
    tx.insert(plexusFilters).values(values).run();
  });
  return listFilters(db, adapterId);
}
