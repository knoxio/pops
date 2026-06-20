/**
 * Step body markdown rewriting. Each `ResolvedStepBodyPart` becomes:
 *
 *   text         → verbatim
 *   ref (index)  → `[label](#line-N)` — anchor stable per version
 *   ref (slug)   → `[slug](#ingredient-slug)` — anchor stable per registry
 *   time         → `[qty unit](#timer)`
 *   temperature  → `[qty°unit](#temperature)`
 *
 * The renderer consumes either `body_md` or `body_resolved_json` — markdown
 * for the static cookbook view, JSON for cooking-mode timers.
 */
import type { ResolvedStepBody, ResolvedStepBodyPart } from './resolver-types.js';

/**
 * Lookup from `position` to a render label (descriptor text). The compile
 * pipeline builds this map from the candidate's resolved ingredient blocks
 * before calling `renderBodyMd`.
 */
export type LineLabelMap = ReadonlyMap<number, string>;

/**
 * Lookup from `ingredients.id` to the canonical `ingredients.slug`. Used to
 * render `@slug` step refs as `[slug](#ingredient-slug)` (the resolver pins
 * these to `ingredientId`, not the original text).
 */
export type IngredientSlugMap = ReadonlyMap<number, string>;

export interface RenderContext {
  labels: LineLabelMap;
  slugsByIngredientId: IngredientSlugMap;
}

export function renderBodyMd(body: ResolvedStepBody, ctx: RenderContext): string {
  return body.map((part) => renderPart(part, ctx)).join('');
}

function renderPart(part: ResolvedStepBodyPart, ctx: RenderContext): string {
  switch (part.kind) {
    case 'text':
      return part.value;
    case 'ref':
      return renderRef(part, ctx);
    case 'time':
      return `[${formatQty(part.qty.qty)} ${part.qty.unit}](#timer)`;
    case 'temperature':
      return `[${formatQty(part.qty.qty)}°${part.qty.unit}](#temperature)`;
  }
}

function renderRef(
  part: Extract<ResolvedStepBodyPart, { kind: 'ref' }>,
  ctx: RenderContext
): string {
  if (part.ingredientIndex !== null) {
    const label = ctx.labels.get(part.ingredientIndex) ?? `line-${part.ingredientIndex}`;
    return `[${label}](#line-${part.ingredientIndex})`;
  }
  if (part.ingredientId !== null) {
    const slug = ctx.slugsByIngredientId.get(part.ingredientId);
    if (slug !== undefined) return `[${slug}](#ingredient-${slug})`;
    return `[ingredient-${part.ingredientId}](#ingredient-${part.ingredientId})`;
  }
  return '[?](#unresolved)';
}

function formatQty(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n);
}
