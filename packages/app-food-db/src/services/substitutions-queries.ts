import { and, eq, or, sql } from 'drizzle-orm';

import { substitutions, type SubstitutionRow } from '../schema.js';
import { expectRow, type FoodDb } from './internal.js';

import type { SubstitutionScope, SubstitutionView } from './substitutions.js';

export type { SubstitutionScope, SubstitutionView } from './substitutions.js';

function parseContextTags(raw: string): readonly string[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`context_tags is not a JSON array: ${raw}`);
  }
  return parsed.map((value, idx) => {
    if (typeof value !== 'string') {
      throw new Error(`context_tags[${idx}] is not a string: ${JSON.stringify(value)}`);
    }
    return value;
  });
}

function rowToView(row: SubstitutionRow): SubstitutionView {
  return { ...row, contextTags: parseContextTags(row.contextTags) };
}

export interface ListSubstitutionsInput {
  fromIngredientId?: number;
  fromVariantId?: number;
  toIngredientId?: number;
  toVariantId?: number;
  scope?: SubstitutionScope;
  recipeId?: number;
  contextTag?: string;
}

export function listSubstitutions(
  db: FoodDb,
  input: ListSubstitutionsInput = {}
): SubstitutionView[] {
  const filters = [];
  if (input.fromIngredientId !== undefined) {
    filters.push(eq(substitutions.fromIngredientId, input.fromIngredientId));
  }
  if (input.fromVariantId !== undefined) {
    filters.push(eq(substitutions.fromVariantId, input.fromVariantId));
  }
  if (input.toIngredientId !== undefined) {
    filters.push(eq(substitutions.toIngredientId, input.toIngredientId));
  }
  if (input.toVariantId !== undefined) {
    filters.push(eq(substitutions.toVariantId, input.toVariantId));
  }
  if (input.scope !== undefined) {
    filters.push(eq(substitutions.scope, input.scope));
  }
  if (input.recipeId !== undefined) {
    filters.push(eq(substitutions.recipeId, input.recipeId));
  }
  if (input.contextTag !== undefined) {
    // Empty context_tags is a wildcard ("applies in any context"), so a
    // tag-specific filter must match the requested tag OR any wildcard edge —
    // otherwise wildcards drop out of cook-time queries that supply a context.
    filters.push(
      or(
        sql`json_array_length(${substitutions.contextTags}) = 0`,
        sql`EXISTS (SELECT 1 FROM json_each(${substitutions.contextTags}) WHERE value = ${input.contextTag})`
      )
    );
  }
  const q = db.select().from(substitutions);
  const rows = filters.length > 0 ? q.where(and(...filters)).all() : q.all();
  return rows.map(rowToView);
}

export interface UpdateSubstitutionInput {
  ratio?: number;
  contextTags?: readonly string[];
  notes?: string | null;
}

interface SubstitutionUpdatePatch {
  ratio?: number;
  contextTags?: string;
  notes?: string | null;
}

export function updateSubstitution(
  db: FoodDb,
  id: number,
  input: UpdateSubstitutionInput
): SubstitutionView {
  const patch: SubstitutionUpdatePatch = {};
  if (input.ratio !== undefined) patch.ratio = input.ratio;
  if (input.contextTags !== undefined) patch.contextTags = JSON.stringify(input.contextTags);
  if (input.notes !== undefined) patch.notes = input.notes;
  if (Object.keys(patch).length === 0) {
    throw new Error(`updateSubstitution(${id}): patch must set at least one field`);
  }
  const rows = db
    .update(substitutions)
    .set(patch)
    .where(eq(substitutions.id, id))
    .returning()
    .all();
  return rowToView(expectRow(rows, `updateSubstitution(${id})`));
}
