/**
 * In-memory grouping for `food.fridge.view` — PRD-147.
 *
 * Folds the flat batch rows into `FridgeLocationSection` →
 * `FridgeIngredientGroup` → `FridgeBatchRow`. All four locations are
 * always emitted (even empty) so the UI can render placeholder
 * collapsed sections.
 */
import type {
  BatchLocation,
  FridgeBatchRow,
  FridgeIngredientGroup,
  FridgeLocationSection,
} from '../../../db/index.js';
import type { FlatBatchRow } from './view-query.js';

const MS_PER_DAY = 86_400_000;
const ALL_LOCATIONS: readonly BatchLocation[] = ['pantry', 'fridge', 'freezer', 'other'];

interface IngredientMeta {
  name: string;
  slug: string;
}

export function groupIntoSections(
  rows: readonly FlatBatchRow[],
  recipeSlugByRun: ReadonlyMap<number, string>,
  todayMs: number
): FridgeLocationSection[] {
  const byLocation = initLocationMap();
  const ingredientMeta = new Map<number, IngredientMeta>();

  for (const row of rows) {
    const batch = toBatchRow(row, recipeSlugByRun, todayMs);
    const section = byLocation.get(row.location);
    if (section === undefined) continue;
    const group = section.get(row.ingredientId) ?? [];
    group.push(batch);
    section.set(row.ingredientId, group);
    if (!ingredientMeta.has(row.ingredientId)) {
      ingredientMeta.set(row.ingredientId, {
        name: row.ingredientName,
        slug: row.ingredientSlug,
      });
    }
  }

  return ALL_LOCATIONS.map((location) =>
    buildSection(location, byLocation.get(location) ?? new Map(), ingredientMeta)
  );
}

function initLocationMap(): Map<BatchLocation, Map<number, FridgeBatchRow[]>> {
  const m = new Map<BatchLocation, Map<number, FridgeBatchRow[]>>();
  for (const loc of ALL_LOCATIONS) m.set(loc, new Map());
  return m;
}

function toBatchRow(
  row: FlatBatchRow,
  recipeSlugByRun: ReadonlyMap<number, string>,
  todayMs: number
): FridgeBatchRow {
  const slug = resolveRecipeSlugForRow(row, recipeSlugByRun);
  return {
    id: row.id,
    variantName: row.variantName,
    variantSlug: row.variantSlug,
    prepStateLabel: row.prepStateLabel,
    qtyRemaining: row.qtyRemaining,
    unit: row.unit,
    expiresAt: row.expiresAt,
    daysToExpiry: computeDaysToExpiry(row.expiresAt, todayMs),
    producedAt: row.producedAt,
    sourceType: row.sourceType,
    sourceRecipeSlug: slug,
    notes: row.notes,
    deletedAt: row.deletedAt,
  };
}

function resolveRecipeSlugForRow(
  row: FlatBatchRow,
  recipeSlugByRun: ReadonlyMap<number, string>
): string | null {
  if (row.sourceType !== 'recipe_run' || row.sourceId === null) return null;
  return recipeSlugByRun.get(row.sourceId) ?? null;
}

function buildSection(
  location: BatchLocation,
  ingredientMap: ReadonlyMap<number, FridgeBatchRow[]>,
  ingredientMeta: ReadonlyMap<number, IngredientMeta>
): FridgeLocationSection {
  const ingredientList: FridgeIngredientGroup[] = [...ingredientMap.entries()]
    .map(([ingredientId, batchList]) => {
      const meta = ingredientMeta.get(ingredientId);
      return {
        ingredientId,
        ingredientName: meta?.name ?? '',
        ingredientSlug: meta?.slug ?? '',
        batches: batchList,
      };
    })
    .toSorted((a, b) => a.ingredientName.localeCompare(b.ingredientName));
  const count = ingredientList.reduce((sum, g) => sum + g.batches.length, 0);
  return { location, count, ingredients: ingredientList };
}

function computeDaysToExpiry(expiresAt: string | null, todayMs: number): number | null {
  if (expiresAt === null) return null;
  const d = new Date(expiresAt);
  const expiryMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  if (Number.isNaN(expiryMs)) return null;
  return Math.round((expiryMs - todayMs) / MS_PER_DAY);
}

export function toUtcMidnight(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
