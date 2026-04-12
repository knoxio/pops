import { comparisonDimensions } from '@pops/db-types';
import { asc, eq } from 'drizzle-orm';

import { getDrizzle } from '../../../db.js';
import { ConflictError, NotFoundError } from '../../../shared/errors.js';
import type {
  ComparisonDimensionRow,
  CreateDimensionInput,
  UpdateDimensionInput,
} from './types.js';

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
export function seedDefaultDimensions(): boolean {
  const db = getDrizzle();
  const existing = db.select({ id: comparisonDimensions.id }).from(comparisonDimensions).get();
  if (existing) return false;

  for (const dim of DEFAULT_DIMENSIONS) {
    db.insert(comparisonDimensions)
      .values({ name: dim.name, description: dim.description, active: 1, sortOrder: dim.sortOrder })
      .run();
  }
  return true;
}

export function listDimensions(): ComparisonDimensionRow[] {
  const db = getDrizzle();
  const rows = db
    .select()
    .from(comparisonDimensions)
    .orderBy(asc(comparisonDimensions.sortOrder))
    .all();
  if (rows.length === 0) {
    seedDefaultDimensions();
    return db
      .select()
      .from(comparisonDimensions)
      .orderBy(asc(comparisonDimensions.sortOrder))
      .all();
  }
  return rows;
}

export function getDimension(id: number): ComparisonDimensionRow {
  const db = getDrizzle();
  const row = db.select().from(comparisonDimensions).where(eq(comparisonDimensions.id, id)).get();
  if (!row) throw new NotFoundError('Dimension', String(id));
  return row;
}

export function createDimension(input: CreateDimensionInput): ComparisonDimensionRow {
  const db = getDrizzle();

  const existing = db
    .select({ id: comparisonDimensions.id })
    .from(comparisonDimensions)
    .where(eq(comparisonDimensions.name, input.name))
    .get();
  if (existing) {
    throw new ConflictError(`Dimension '${input.name}' already exists`);
  }

  const result = db
    .insert(comparisonDimensions)
    .values({
      name: input.name,
      description: input.description ?? null,
      active: input.active ? 1 : 0,
      sortOrder: input.sortOrder ?? 0,
      weight: input.weight ?? 1.0,
    })
    .run();

  return getDimension(Number(result.lastInsertRowid));
}

export function updateDimension(id: number, input: UpdateDimensionInput): ComparisonDimensionRow {
  const db = getDrizzle();
  getDimension(id); // verify exists

  const updates: Partial<typeof comparisonDimensions.$inferInsert> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description ?? null;
  if (input.active !== undefined) updates.active = input.active ? 1 : 0;
  if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;
  if (input.weight !== undefined) updates.weight = input.weight;

  if (Object.keys(updates).length > 0) {
    db.update(comparisonDimensions).set(updates).where(eq(comparisonDimensions.id, id)).run();
  }

  return getDimension(id);
}
