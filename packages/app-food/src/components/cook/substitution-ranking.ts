/**
 * PRD-149 — substitution candidate ranking.
 *
 * Pure function so the Vitest fixture in `BatchOverridePicker.test.tsx`
 * can pin the order independent of React. Sort key per the PRD:
 *
 *   1. `|ratio - 1.0|` ASC
 *   2. context-tag overlap (with the recipe's tags) DESC
 *   3. earliest batch expiry ASC NULLS LAST
 *   4. ingredient name ASC (deterministic tie-break)
 */
export interface RankableCandidate {
  ratio: number;
  contextTags: readonly string[];
  ingredientName: string;
  earliestExpiry: string | null;
}

export function rankSubstitutionCandidates(
  candidates: readonly RankableCandidate[],
  recipeContextTags: readonly string[]
): readonly number[] {
  const recipeSet = new Set(recipeContextTags);
  const indices = candidates.map((_, i) => i);
  indices.sort((a, b) => {
    const left = candidates[a];
    const right = candidates[b];
    if (left === undefined || right === undefined) return 0;
    return compare(left, right, recipeSet);
  });
  return indices;
}

function compare(
  a: RankableCandidate,
  b: RankableCandidate,
  recipeSet: ReadonlySet<string>
): number {
  const ratioCmp = Math.abs(a.ratio - 1.0) - Math.abs(b.ratio - 1.0);
  if (ratioCmp !== 0) return ratioCmp;
  const overlapCmp =
    countOverlap(b.contextTags, recipeSet) - countOverlap(a.contextTags, recipeSet);
  if (overlapCmp !== 0) return overlapCmp;
  const expiryCmp = compareExpiry(a.earliestExpiry, b.earliestExpiry);
  if (expiryCmp !== 0) return expiryCmp;
  return a.ingredientName.localeCompare(b.ingredientName);
}

function countOverlap(tags: readonly string[], recipeSet: ReadonlySet<string>): number {
  let count = 0;
  for (const tag of tags) {
    if (recipeSet.has(tag)) count += 1;
  }
  return count;
}

function compareExpiry(a: string | null, b: string | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b);
}
