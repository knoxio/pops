/**
 * Dimension CRUD against the media pillar's SQLite.
 *
 * Ported from the monolith `comparisons/dimensions.service.ts`, converted to
 * the pillar's `(db, …)` arg pattern + db-domain errors (the monolith threw
 * HTTP errors; the pillar maps to status codes at the handler boundary).
 */
import { asc, eq } from 'drizzle-orm';

import { comparisonDimensions } from '../../schema.js';
import { DimensionConflictError, DimensionNotFoundError } from './errors.js';

import type { ComparisonDimensionRow } from '../../row-types.js';
import type { MediaDb } from '../internal.js';
import type { CreateDimensionInput, UpdateDimensionInput } from './mappers.js';

const DEFAULT_DIMENSIONS = [
  { name: 'Cinematography', description: 'Visual quality, framing, and camera work', sortOrder: 0 },
  { name: 'Entertainment', description: 'How engaging and enjoyable to watch', sortOrder: 1 },
  {
    name: 'Emotional Impact',
    description: 'Depth of feeling and emotional resonance',
    sortOrder: 2,
  },
  { name: 'Rewatchability', description: 'How well it holds up on repeat viewings', sortOrder: 3 },
  { name: 'Soundtrack', description: 'Music, score, and sound design quality', sortOrder: 4 },
];

/** Seed default dimensions if none exist. Returns true if seeded. */
export function seedDefaultDimensions(db: MediaDb): boolean {
  const existing = db.select({ id: comparisonDimensions.id }).from(comparisonDimensions).get();
  if (existing) return false;

  for (const dim of DEFAULT_DIMENSIONS) {
    db.insert(comparisonDimensions)
      .values({ name: dim.name, description: dim.description, active: 1, sortOrder: dim.sortOrder })
      .run();
  }
  return true;
}

/** List dimensions ordered by sort order. Seeds defaults on first read. */
export function listDimensions(db: MediaDb): ComparisonDimensionRow[] {
  const rows = db
    .select()
    .from(comparisonDimensions)
    .orderBy(asc(comparisonDimensions.sortOrder))
    .all();
  if (rows.length === 0) {
    seedDefaultDimensions(db);
    return db
      .select()
      .from(comparisonDimensions)
      .orderBy(asc(comparisonDimensions.sortOrder))
      .all();
  }
  return rows;
}

/** Get a dimension by id. Throws `DimensionNotFoundError` if missing. */
export function getDimension(db: MediaDb, id: number): ComparisonDimensionRow {
  const row = db.select().from(comparisonDimensions).where(eq(comparisonDimensions.id, id)).get();
  if (!row) throw new DimensionNotFoundError(id);
  return row;
}

/** Create a dimension. Rejects a duplicate name with `DimensionConflictError`. */
export function createDimension(db: MediaDb, input: CreateDimensionInput): ComparisonDimensionRow {
  const existing = db
    .select({ id: comparisonDimensions.id })
    .from(comparisonDimensions)
    .where(eq(comparisonDimensions.name, input.name))
    .get();
  if (existing) throw new DimensionConflictError(input.name);

  const result = db
    .insert(comparisonDimensions)
    .values({
      name: input.name,
      description: input.description ?? null,
      active: input.active === false ? 0 : 1,
      sortOrder: input.sortOrder ?? 0,
      weight: input.weight ?? 1.0,
    })
    .run();

  return getDimension(db, Number(result.lastInsertRowid));
}

/** Patch a dimension. Throws `DimensionNotFoundError` if missing. */
export function updateDimension(
  db: MediaDb,
  id: number,
  input: UpdateDimensionInput
): ComparisonDimensionRow {
  getDimension(db, id);

  const updates: Partial<typeof comparisonDimensions.$inferInsert> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description ?? null;
  if (input.active !== undefined) updates.active = input.active ? 1 : 0;
  if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;
  if (input.weight !== undefined) updates.weight = input.weight;

  if (Object.keys(updates).length > 0) {
    db.update(comparisonDimensions).set(updates).where(eq(comparisonDimensions.id, id)).run();
  }

  return getDimension(db, id);
}
