/**
 * `recipeYield` parsing.
 *
 * The field is one of:
 *   - A number: `4`.
 *   - A short noun phrase: `"4 servings"`, `"4-6 servings"`, `"makes 12 cookies"`.
 *   - An array of strings (rare; schema.org allows it).
 *
 * Returns `{ qty, unit }` where unit is a DSL slug. If only a number is
 * present, unit defaults to `"serving"`. If no number can be extracted,
 * we fall back to `{ qty: 4, unit: 'serving' }`.
 */
export interface YieldParse {
  qty: number;
  unit: string;
}

const NUMBER_RE = /(\d+(?:\.\d+)?)/;
const WORD_RE = /([a-z][a-z-]*)/i;

export function parseYield(input: unknown): YieldParse {
  const raw = pickFirstString(input);
  if (raw === null) return { qty: 4, unit: 'serving' };
  const number = NUMBER_RE.exec(raw);
  if (number === null) {
    return { qty: 4, unit: 'serving' };
  }
  const qty = Math.max(1, Math.round(Number(number[1] ?? '0')));
  const remainder = raw.slice(number.index + number[0].length).trim();
  const wordMatch = WORD_RE.exec(remainder);
  const word = wordMatch ? (wordMatch[1] ?? '').toLowerCase() : '';
  const unit = normaliseYieldUnit(word);
  return { qty, unit };
}

function pickFirstString(input: unknown): string | null {
  if (typeof input === 'string') return input;
  if (typeof input === 'number' && Number.isFinite(input)) return String(input);
  if (Array.isArray(input)) {
    for (const item of input) {
      const r = pickFirstString(item);
      if (r !== null) return r;
    }
  }
  return null;
}

/**
 * Map the noun word into a DSL-grammar slug. We keep this very small —
 * Recipe sites mostly say "servings", sometimes "cookies", "loaves",
 * "rolls", "burgers". Anything else collapses to the noun itself
 * (slug-trimmed) or `serving` as the final fallback.
 */
function normaliseYieldUnit(word: string): string {
  if (word === '') return 'serving';
  if (word === 'servings' || word === 'serving' || word === 'portions' || word === 'portion') {
    return 'serving';
  }
  const slug = word.replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  if (slug === '' || !/^[a-z]/.test(slug)) return 'serving';
  return slug;
}
