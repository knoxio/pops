/**
 * Public types for the DSL chip scanner (PRD-120 part D).
 *
 * `Chip` is a single in-body decoration target with absolute document
 * offsets. `IngredientDeclaration` is the per-index lookup entry used to
 * resolve `@N` chip labels and click-jump targets.
 */
export type Chip = RefIndexChip | RefSlugChip | InlineFuncChip;

interface BaseChip {
  /** Absolute document offset (inclusive). */
  from: number;
  /** Absolute document offset (exclusive). */
  to: number;
}

export interface RefIndexChip extends BaseChip {
  kind: 'ref-index';
  index: number;
}

export interface RefSlugChip extends BaseChip {
  kind: 'ref-slug';
  slug: string;
}

export interface InlineFuncChip extends BaseChip {
  kind: 'time' | 'temperature';
  qty: number;
  unit: string;
}

export interface IngredientDeclaration {
  index: number;
  slug: string;
  variant?: string;
  prep?: string;
  /** Document offset where the `@ingredient(` call starts — used as a
   * click-jump target so the cursor lands at the `@`. */
  callStart: number;
}

export interface ChipScanResult {
  chips: Chip[];
  declarations: Map<number, IngredientDeclaration>;
}
