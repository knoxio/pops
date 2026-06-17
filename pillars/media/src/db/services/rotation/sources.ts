/**
 * Rotation source queries against the media pillar's SQLite.
 *
 * HTTP-free; `(db, …)`-arg. Ported from the monolith
 * `rotation-sources-router.ts`. The `config` column stores opaque JSON text;
 * callers serialise/deserialise at the boundary.
 */
import { count, desc, eq } from 'drizzle-orm';

import { RotationManualSourceProtectedError, RotationSourceNotFoundError } from '../../errors.js';
import { rotationCandidates, rotationSources } from '../../schema.js';

import type { MediaDb } from '../internal.js';

export type RotationSourceRow = typeof rotationSources.$inferSelect;

/** A source row decorated with the count of its candidates. */
export interface SourceWithCount extends RotationSourceRow {
  candidateCount: number;
}

export interface CreateSourceInput {
  type: string;
  name: string;
  priority: number;
  enabled: boolean;
  config: string;
  syncIntervalHours: number;
}

export interface UpdateSourceInput {
  name?: string;
  priority?: number;
  enabled?: boolean;
  config?: string;
  syncIntervalHours?: number;
}

/** List all sources with their candidate counts, highest priority first. */
export function listSources(db: MediaDb): SourceWithCount[] {
  return db
    .select({
      id: rotationSources.id,
      type: rotationSources.type,
      name: rotationSources.name,
      priority: rotationSources.priority,
      enabled: rotationSources.enabled,
      config: rotationSources.config,
      lastSyncedAt: rotationSources.lastSyncedAt,
      syncIntervalHours: rotationSources.syncIntervalHours,
      createdAt: rotationSources.createdAt,
      candidateCount: count(rotationCandidates.id),
    })
    .from(rotationSources)
    .leftJoin(rotationCandidates, eq(rotationSources.id, rotationCandidates.sourceId))
    .groupBy(rotationSources.id)
    .orderBy(desc(rotationSources.priority))
    .all();
}

/** Fetch a single source by id, or `null` when absent. */
export function getSource(db: MediaDb, id: number): RotationSourceRow | null {
  return db.select().from(rotationSources).where(eq(rotationSources.id, id)).get() ?? null;
}

/** Create a source. Returns the persisted row. */
export function createSource(db: MediaDb, input: CreateSourceInput): RotationSourceRow {
  return db
    .insert(rotationSources)
    .values({
      type: input.type,
      name: input.name,
      priority: input.priority,
      enabled: input.enabled ? 1 : 0,
      config: input.config,
      syncIntervalHours: input.syncIntervalHours,
    })
    .returning()
    .get();
}

function buildSourceUpdate(input: UpdateSourceInput): Partial<typeof rotationSources.$inferInsert> {
  const updates: Partial<typeof rotationSources.$inferInsert> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.priority !== undefined) updates.priority = input.priority;
  if (input.enabled !== undefined) updates.enabled = input.enabled ? 1 : 0;
  if (input.config !== undefined) updates.config = input.config;
  if (input.syncIntervalHours !== undefined) updates.syncIntervalHours = input.syncIntervalHours;
  return updates;
}

/**
 * Patch a source. Returns the updated row. Throws
 * {@link RotationSourceNotFoundError} when the id is unknown. With no fields to
 * update, the row is re-read unchanged.
 */
export function updateSource(db: MediaDb, id: number, input: UpdateSourceInput): RotationSourceRow {
  const existing = getSource(db, id);
  if (!existing) throw new RotationSourceNotFoundError(id);

  const updates = buildSourceUpdate(input);
  if (Object.keys(updates).length > 0) {
    db.update(rotationSources).set(updates).where(eq(rotationSources.id, id)).run();
  }
  const updated = getSource(db, id);
  if (!updated) throw new RotationSourceNotFoundError(id);
  return updated;
}

/**
 * Delete a source and cascade-delete its candidates. Throws
 * {@link RotationSourceNotFoundError} when absent and
 * {@link RotationManualSourceProtectedError} for the manual source.
 */
export function deleteSource(db: MediaDb, id: number): void {
  const source = getSource(db, id);
  if (!source) throw new RotationSourceNotFoundError(id);
  if (source.type === 'manual') throw new RotationManualSourceProtectedError();

  db.transaction((tx) => {
    tx.delete(rotationCandidates).where(eq(rotationCandidates.sourceId, id)).run();
    tx.delete(rotationSources).where(eq(rotationSources.id, id)).run();
  });
}
