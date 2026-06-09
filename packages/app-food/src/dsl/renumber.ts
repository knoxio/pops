/**
 * Recipe-DSL renumber transform — PRD-120 part E.
 *
 * Given a source string and a permutation describing the desired order of
 * `@ingredient(...)` declarations, produces:
 *
 *   1. A set of `RenumberChange` records (sorted by `from`, non-overlapping)
 *      that a CodeMirror transaction can dispatch wholesale.
 *   2. The new source text after applying those changes.
 *   3. The old→new index map used to rewrite step refs.
 *
 * Rules:
 *
 *   - Declarations are **physically reordered** inside the source: their
 *     text blocks (from leading `@ingredient` to matching `)`) are placed
 *     at the original byte slots of the new ordering. Non-block text
 *     between blocks is preserved at its original position — only the
 *     blocks themselves move. After reorder, each block's index N is
 *     rewritten to its new 1-based position (slot 0 → 1, slot 1 → 2, …).
 *   - `@N` step-body references are rewritten when N matches an old
 *     declaration index. Unknown indices (no matching declaration) are
 *     left untouched.
 *   - `@slug` step-body refs, `@time(...)`, `@temperature(...)`,
 *     `@recipe(...)`, `@yield(...)` are never touched.
 *   - A no-op permutation that already produces 1..N indices in slot
 *     order yields zero changes.
 */
import {
  scanIngredientUsages,
  type IngredientDeclaration,
  type ScanResult,
  type StepBodyRef,
} from './renumber-scanner';

export { scanIngredientUsages };
export type { IngredientDeclaration, ScanResult, StepBodyRef };

export interface RenumberChange {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
}

export interface RenumberPlan {
  readonly changes: readonly RenumberChange[];
  readonly newSource: string;
  /** Map from old `currentIndex` value → new 1-based slot. */
  readonly indexRewrites: ReadonlyMap<number, number>;
}

export class RenumberPermutationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RenumberPermutationError';
  }
}

/**
 * Compute the renumber plan.
 *
 * @param source - Current DSL source text.
 * @param permutation - `permutation[k] = i` means the declaration that
 *   `scan.declarations[i]` describes should land in slot `k` after the
 *   reorder. Length must equal `scan.declarations.length` and contain
 *   each integer `0..N-1` exactly once.
 * @param scan - Result of `scanIngredientUsages(source)`. Accepting it as
 *   a parameter lets the UI scan once for its own display and reuse the
 *   same offsets here.
 */
export function buildRenumberPlan(
  source: string,
  permutation: readonly number[],
  scan: ScanResult = scanIngredientUsages(source)
): RenumberPlan {
  validatePermutation(permutation, scan.declarations.length);
  const indexRewrites = buildIndexRewrites(scan.declarations, permutation);
  const declChanges = buildDeclarationChanges(source, scan.declarations, permutation);
  const stepChanges = buildStepRefChanges(scan.stepRefs, indexRewrites);
  const changes = [...declChanges, ...stepChanges].toSorted((a, b) => a.from - b.from);
  return { changes, newSource: applyChanges(source, changes), indexRewrites };
}

function validatePermutation(permutation: readonly number[], n: number): void {
  if (permutation.length !== n) {
    throw new RenumberPermutationError(
      `permutation length ${permutation.length} does not match declaration count ${n}`
    );
  }
  const seen = new Set<number>();
  for (const value of permutation) {
    if (!Number.isInteger(value) || value < 0 || value >= n) {
      throw new RenumberPermutationError(
        `permutation contains invalid index ${value}; expected an integer in [0, ${n})`
      );
    }
    if (seen.has(value)) {
      throw new RenumberPermutationError(`permutation has duplicate index ${value}`);
    }
    seen.add(value);
  }
}

function buildIndexRewrites(
  declarations: readonly IngredientDeclaration[],
  permutation: readonly number[]
): Map<number, number> {
  const rewrites = new Map<number, number>();
  for (let newSlot = 0; newSlot < permutation.length; newSlot += 1) {
    const decl = declarations[permutation[newSlot] ?? -1];
    if (decl === undefined) continue;
    const newIndex = newSlot + 1;
    if (decl.currentIndex === newIndex) continue;
    // Two declarations share `currentIndex` (the user wrote
    // `@ingredient(1, …)` twice). The second occurrence is ambiguous as
    // a step-ref target; keep the first mapping and skip duplicates so
    // the editor's "works on a half-broken doc" contract holds.
    if (rewrites.has(decl.currentIndex)) continue;
    rewrites.set(decl.currentIndex, newIndex);
  }
  return rewrites;
}

function buildDeclarationChanges(
  source: string,
  declarations: readonly IngredientDeclaration[],
  permutation: readonly number[]
): RenumberChange[] {
  const changes: RenumberChange[] = [];
  for (let newSlot = 0; newSlot < permutation.length; newSlot += 1) {
    const slotDecl = declarations[newSlot];
    const sourceDecl = declarations[permutation[newSlot] ?? -1];
    if (slotDecl === undefined || sourceDecl === undefined) continue;
    const newIndex = newSlot + 1;
    if (sourceDecl === slotDecl && sourceDecl.currentIndex === newIndex) continue;
    changes.push(buildSlotChange(source, slotDecl, sourceDecl, newIndex));
  }
  return changes;
}

function buildSlotChange(
  source: string,
  slotDecl: IngredientDeclaration,
  sourceDecl: IngredientDeclaration,
  newIndex: number
): RenumberChange {
  const sourceBlockText = source.slice(sourceDecl.blockStart, sourceDecl.blockEnd);
  const rewritten = rewriteIndexInBlock(sourceBlockText, sourceDecl, newIndex);
  return { from: slotDecl.blockStart, to: slotDecl.blockEnd, insert: rewritten };
}

function rewriteIndexInBlock(
  blockText: string,
  decl: IngredientDeclaration,
  newIndex: number
): string {
  const relStart = decl.indexStart - decl.blockStart;
  const relEnd = decl.indexEnd - decl.blockStart;
  return blockText.slice(0, relStart) + String(newIndex) + blockText.slice(relEnd);
}

function buildStepRefChanges(
  stepRefs: readonly StepBodyRef[],
  indexRewrites: ReadonlyMap<number, number>
): RenumberChange[] {
  const out: RenumberChange[] = [];
  for (const ref of stepRefs) {
    const target = indexRewrites.get(ref.currentIndex);
    if (target === undefined) continue;
    out.push({ from: ref.indexStart, to: ref.indexEnd, insert: String(target) });
  }
  return out;
}

function applyChanges(source: string, changes: readonly RenumberChange[]): string {
  let cursor = 0;
  let out = '';
  for (const change of changes) {
    if (change.from < cursor) {
      throw new RenumberPermutationError(
        `overlapping changes at offset ${change.from} (cursor ${cursor})`
      );
    }
    out += source.slice(cursor, change.from) + change.insert;
    cursor = change.to;
  }
  out += source.slice(cursor);
  return out;
}
