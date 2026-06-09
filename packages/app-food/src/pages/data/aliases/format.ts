/**
 * Pure label + sort helpers for the Aliases tab (PRD-122-C).
 *
 * Kept separate from the table component so the sort comparator can be
 * unit-tested without rendering React.
 */
import type { AliasRow, AliasSortKey, AliasTarget, SortDirection } from './types';

/**
 * Human-readable target label rendered inside the Target column.
 *
 * Variants disambiguate via `parent — variant` (em-dash) so two variants
 * sharing a slug across different ingredients (e.g. `apple:raw` vs
 * `banana:raw`) stay distinguishable. Ingredients use their canonical
 * name; the slug is shown separately so the column is still searchable.
 */
export function formatTargetLabel(target: AliasTarget): string {
  if (target.kind === 'ingredient') return target.name;
  return `${target.parentIngredientName} — ${target.name}`;
}

/** Slug rendered in the secondary line of the Target column. */
export function formatTargetSlug(target: AliasTarget): string {
  if (target.kind === 'ingredient') return target.slug;
  return `${target.parentIngredientSlug}:${target.slug}`;
}

function comparatorValue(row: AliasRow, key: AliasSortKey): string {
  if (key === 'alias') return row.alias.toLocaleLowerCase();
  if (key === 'source') return row.source;
  if (key === 'createdAt') return row.createdAt;
  return formatTargetLabel(row.target).toLocaleLowerCase();
}

/**
 * Stable sort by `(key, id)` — when two rows share the primary value the
 * row id breaks the tie, so the table never re-orders rows that look
 * identical from the user's POV.
 */
export function sortAliases(
  rows: readonly AliasRow[],
  key: AliasSortKey,
  direction: SortDirection
): AliasRow[] {
  const dir = direction === 'asc' ? 1 : -1;
  return [...rows].toSorted((a, b) => {
    const va = comparatorValue(a, key);
    const vb = comparatorValue(b, key);
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return a.id - b.id;
  });
}
