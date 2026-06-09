/**
 * PRD-127 — ingredient-line heuristic.
 *
 * JSON-LD ingredient lines are free-form strings:
 *
 *   - "500g beef chuck mince"
 *   - "1 cup milk"
 *   - "½ tsp salt"
 *   - "1 cup (240ml) milk"
 *   - "salt"
 *
 * The mapping is deliberately dumb (per the PRD): split into qty + unit +
 * descriptor; let the resolver auto-create the ingredient slug; the user
 * cleans up the noisy descriptors from the review queue.
 */
import { slugify } from './slugify.js';

export interface IngredientParse {
  qty: number;
  unit: string;
  descriptorSlug: string;
  /** Original descriptor text (post strip of qty/unit/parens). Used in step-text refs. */
  descriptorRaw: string;
}

const UNICODE_FRACTIONS: Record<string, number> = {
  '½': 0.5,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '¼': 0.25,
  '¾': 0.75,
  '⅕': 0.2,
  '⅖': 0.4,
  '⅗': 0.6,
  '⅘': 0.8,
  '⅙': 1 / 6,
  '⅚': 5 / 6,
  '⅛': 0.125,
  '⅜': 0.375,
  '⅝': 0.625,
  '⅞': 0.875,
};

// Order matters: the multi-character "ml" must beat the single-letter "l", etc.
const KNOWN_UNITS: readonly string[] = [
  'tablespoons',
  'tablespoon',
  'teaspoons',
  'teaspoon',
  'tbsp',
  'tsp',
  'cups',
  'cup',
  'ounces',
  'ounce',
  'pounds',
  'pound',
  'grams',
  'gram',
  'kilograms',
  'kilogram',
  'litres',
  'liters',
  'litre',
  'liter',
  'millilitres',
  'milliliters',
  'millilitre',
  'milliliter',
  'pieces',
  'piece',
  'slices',
  'slice',
  'cloves',
  'clove',
  'sprigs',
  'sprig',
  'cans',
  'can',
  'lb',
  'lbs',
  'oz',
  'mg',
  'kg',
  'ml',
  'cl',
  'dl',
  'l',
  'g',
];

const UNIT_ALIASES: Record<string, string> = {
  tablespoons: 'tbsp',
  tablespoon: 'tbsp',
  teaspoons: 'tsp',
  teaspoon: 'tsp',
  cups: 'cup',
  ounces: 'oz',
  ounce: 'oz',
  pounds: 'lb',
  pound: 'lb',
  lbs: 'lb',
  grams: 'g',
  gram: 'g',
  kilograms: 'kg',
  kilogram: 'kg',
  litres: 'l',
  liters: 'l',
  litre: 'l',
  liter: 'l',
  millilitres: 'ml',
  milliliters: 'ml',
  millilitre: 'ml',
  milliliter: 'ml',
  pieces: 'count',
  piece: 'count',
  slices: 'slice',
  cloves: 'clove',
  sprigs: 'sprig',
  cans: 'can',
};

export function parseIngredientLine(raw: string): IngredientParse {
  const stripped = stripHtml(raw)
    .replace(/\s*\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (stripped === '') {
    return { qty: 1, unit: 'count', descriptorSlug: 'ingredient', descriptorRaw: '' };
  }
  const { qty, rest: afterQty } = readQuantity(stripped);
  if (qty === null) {
    const desc = afterQty.trim();
    return { qty: 1, unit: 'count', descriptorSlug: descriptorSlugOf(desc), descriptorRaw: desc };
  }
  const { unit, rest: afterUnit } = readUnit(afterQty);
  const descriptor = afterUnit.replace(/^[,\s]+/, '').trim();
  return { qty, unit, descriptorSlug: descriptorSlugOf(descriptor), descriptorRaw: descriptor };
}

/**
 * `slugify('')` returns the recipe-level fallback `'recipe'`, which is the
 * wrong default for an ingredient descriptor — it can collide with the
 * recipe slug itself. For ingredient lines with a quantity/unit but no
 * descriptor (e.g. just "2" or "2 ,"), emit the explicit `'ingredient'`
 * sentinel instead.
 */
function descriptorSlugOf(descriptor: string): string {
  if (descriptor.trim() === '') return 'ingredient';
  const slug = slugify(descriptor);
  return slug === 'recipe' ? 'ingredient' : slug;
}

interface QuantityRead {
  qty: number | null;
  rest: string;
}

function readQuantity(input: string): QuantityRead {
  const head = input[0];
  if (head !== undefined && head in UNICODE_FRACTIONS) {
    const frac = UNICODE_FRACTIONS[head] ?? 0;
    return { qty: frac, rest: input.slice(1).trim() };
  }
  // Mixed unicode-fraction form: `2¼` — integer then unicode fraction with
  // no separator.
  const mixedUnicode = /^(\d+)([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])\s*/u.exec(input);
  if (mixedUnicode !== null) {
    const whole = Number(mixedUnicode[1] ?? '0');
    const fracKey = mixedUnicode[2] ?? '';
    const fracVal = UNICODE_FRACTIONS[fracKey] ?? 0;
    return { qty: round3(whole + fracVal), rest: input.slice(mixedUnicode[0].length) };
  }
  // ASCII fractions must be matched before bare digits so the regex doesn't
  // greedily consume the numerator and leave the denominator behind.
  const numberMatch = /^(\d+\/\d+|\d+(?:\s+\d+\/\d+)?(?:\.\d+)?)\s*/u.exec(input);
  if (numberMatch === null) return { qty: null, rest: input };

  const numberRaw = numberMatch[1] ?? '';
  const rest = input.slice(numberMatch[0].length);
  if (numberRaw.includes('/')) return parseAsciiFraction(numberRaw, rest, input);
  return { qty: round3(Number(numberRaw)), rest };
}

function parseAsciiFraction(numberRaw: string, rest: string, originalInput: string): QuantityRead {
  const parts = numberRaw.split(/\s+/);
  let total = 0;
  for (const part of parts) {
    if (part.includes('/')) {
      const [nStr, dStr] = part.split('/');
      const n = Number(nStr);
      const d = Number(dStr);
      if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) {
        return { qty: null, rest: originalInput };
      }
      total += n / d;
    } else {
      total += Number(part);
    }
  }
  return { qty: round3(total), rest };
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

interface UnitRead {
  unit: string;
  rest: string;
}

function readUnit(input: string): UnitRead {
  const trimmed = input.replace(/^[\s,]+/, '');
  // Sticky unit (e.g. "500g") — already tokenised: the qty regex ate the digits but
  // a sticky letter cluster may now lead `trimmed`.
  const stickyMatch = /^([a-zA-Z]+)\b/.exec(trimmed);
  if (stickyMatch === null) {
    return { unit: 'count', rest: trimmed };
  }
  const candidate = (stickyMatch[1] ?? '').toLowerCase();
  for (const known of KNOWN_UNITS) {
    if (candidate === known) {
      const rest = trimmed.slice(stickyMatch[0].length);
      const unit = UNIT_ALIASES[known] ?? known;
      return { unit, rest };
    }
  }
  // Not a known unit token — treat the whole remainder as the descriptor and
  // default unit to `count`.
  return { unit: 'count', rest: trimmed };
}

function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '');
}
