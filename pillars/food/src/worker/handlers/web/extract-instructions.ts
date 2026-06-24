/**
 * Flatten the `recipeInstructions` field.
 * See pillars/food/docs/prds/web-jsonld.
 *
 * Schema.org permits several shapes:
 *   - `"recipeInstructions": "Do step one. Do step two."` (one string)
 *   - `"recipeInstructions": ["text", "text", ...]`
 *   - `"recipeInstructions": [{ "@type": "HowToStep", "text": "..." }, ...]`
 *   - `"recipeInstructions": [{ "@type": "HowToSection", "itemListElement": [HowToStep, ...] }, ...]`
 *
 * HowToSection is flattened into its steps; section names are dropped.
 * Single-string instructions get split by sentence boundary as a coarse
 * fallback so the user gets multiple step rows to work with.
 */
export function extractInstructionTexts(input: unknown): string[] {
  const collected: string[] = [];
  walk(input, collected);
  return collected
    .map((s) => stripHtml(s))
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 0);
}

function walk(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    splitFlatString(value, out);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walk(item, out);
    return;
  }
  if (isPlainObject(value)) {
    const type = value['@type'];
    if (matchesType(type, 'HowToSection')) {
      const items = value['itemListElement'] ?? value['steps'];
      walk(items, out);
      return;
    }
    // HowToStep — or an unknown object with a `text` slot.
    const text = pickTextField(value);
    if (text !== null) {
      out.push(text);
      return;
    }
    // Generic descent for arrays embedded under unknown keys.
    for (const inner of Object.values(value)) {
      if (Array.isArray(inner) || isPlainObject(inner)) walk(inner, out);
    }
  }
}

function pickTextField(value: Record<string, unknown>): string | null {
  for (const key of ['text', 'description', 'name']) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate;
  }
  return null;
}

function splitFlatString(text: string, out: string[]): void {
  // Coarse split on sentence-ending punctuation followed by whitespace +
  // capital letter. Keeps short single-sentence inputs intact.
  const parts = text.split(/(?<=[.!?])\s+(?=[A-Z])/u);
  for (const part of parts) out.push(part);
}

function matchesType(type: unknown, target: string): boolean {
  if (typeof type === 'string') return type === target || type.endsWith(`/${target}`);
  if (Array.isArray(type)) return type.some((t) => matchesType(t, target));
  return false;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}
