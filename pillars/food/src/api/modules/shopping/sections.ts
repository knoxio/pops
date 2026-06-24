/**
 * Section assembly.
 *
 * Resolves each ingredient's `store-section:*` tag (alphabetically first if
 * multiple), groups items into sections ordered alphabetically by
 * `sectionLabel`, with "Other / Uncategorised" last among regular sections
 * and "Unconverted" last-of-all. Pure function over already-loaded data;
 * the caller hands in the canonical items, unconverted items, and the
 * full tag map.
 */
import { type GeneratorItem, type GeneratorSection } from './types.js';

export const STORE_SECTION_PREFIX = 'store-section:';
const OTHER_LABEL = 'Other / Uncategorised';
const UNCONVERTED_LABEL = 'Unconverted';

export interface SectionsInput {
  canonicalItems: readonly GeneratorItem[];
  unconvertedItems: readonly GeneratorItem[];
  /** ingredientId → all tags carried by that ingredient (already trimmed/lowered). */
  tagsByIngredientId: ReadonlyMap<number, readonly string[]>;
}

export interface SectionsResult {
  sections: GeneratorSection[];
  /** Distinct ingredientIds whose row landed in the Other bucket. */
  uncategorisedIngredientIds: number[];
}

export function buildSections(input: SectionsInput): SectionsResult {
  const buckets = new Map<string, GeneratorItem[]>();
  const otherItems: GeneratorItem[] = [];
  const uncategorisedSet = new Set<number>();

  for (const item of input.canonicalItems) {
    const tag = pickStoreSectionTag(input.tagsByIngredientId.get(item.ingredientId));
    if (tag === null) {
      otherItems.push(item);
      uncategorisedSet.add(item.ingredientId);
      continue;
    }
    const list = buckets.get(tag);
    if (list === undefined) buckets.set(tag, [item]);
    else list.push(item);
  }

  const sections: GeneratorSection[] = [];
  const sortedTags = [...buckets.keys()].toSorted((a, b) =>
    sectionLabelFromTag(a).localeCompare(sectionLabelFromTag(b))
  );
  for (const tag of sortedTags) {
    const items = buckets.get(tag) ?? [];
    sortIntraSection(items);
    sections.push({ sectionTag: tag, sectionLabel: sectionLabelFromTag(tag), items });
  }
  if (otherItems.length > 0) {
    sortIntraSection(otherItems);
    sections.push({ sectionTag: null, sectionLabel: OTHER_LABEL, items: otherItems });
  }
  if (input.unconvertedItems.length > 0) {
    const unconverted = [...input.unconvertedItems];
    sortIntraSection(unconverted);
    sections.push({ sectionTag: null, sectionLabel: UNCONVERTED_LABEL, items: unconverted });
  }
  return { sections, uncategorisedIngredientIds: [...uncategorisedSet] };
}

export function sectionLabelFromTag(tag: string): string {
  const slug = tag.startsWith(STORE_SECTION_PREFIX) ? tag.slice(STORE_SECTION_PREFIX.length) : tag;
  // Title-case the trailing slug: `store-section:bakery` -> `Bakery`.
  return slug
    .split('-')
    .filter((s) => s.length > 0)
    .map(titleCaseWord)
    .join(' ');
}

function titleCaseWord(word: string): string {
  const first = word.charAt(0);
  return first.toUpperCase() + word.slice(1);
}

export function pickStoreSectionTag(tags: readonly string[] | undefined): string | null {
  if (tags === undefined || tags.length === 0) return null;
  const storeTags = tags.filter((t) => t.startsWith(STORE_SECTION_PREFIX));
  if (storeTags.length === 0) return null;
  const sorted = [...storeTags].toSorted((a, b) => a.localeCompare(b));
  return sorted[0] ?? null;
}

function sortIntraSection(items: GeneratorItem[]): void {
  items.sort((a, b) => {
    const nameCompare = a.ingredientName.localeCompare(b.ingredientName);
    if (nameCompare !== 0) return nameCompare;
    const aVariant = a.variantName ?? '';
    const bVariant = b.variantName ?? '';
    return aVariant.localeCompare(bVariant);
  });
}
