/**
 * Step body markdown rewriting — PRD-116.
 *
 * Each `ResolvedStepBodyPart` becomes a markdown chunk:
 *
 *   text         → verbatim
 *   ref (index)  → `[label](#line-N)` — anchor stable per version
 *   ref (slug)   → `[slug](#ingredient-slug)` — anchor stable per registry
 *   time         → `[qty unit](#timer)`
 *   temperature  → `[qty°unit](#temperature)`
 *
 * The renderer (Epic 01) consumes either `body_md` or `body_resolved_json`
 * depending on the surface — markdown for the static cookbook view, the
 * resolved JSON for cooking-mode timers.
 */
import type { ResolvedStepBody, ResolvedStepBodyPart } from './resolver-types';

/**
 * Lookup from `position` to a render label (descriptor text). The compile
 * pipeline builds this map from the candidate's resolved ingredient blocks
 * before calling `renderBodyMd`.
 */
export type LineLabelMap = ReadonlyMap<number, string>;

export function renderBodyMd(body: ResolvedStepBody, labels: LineLabelMap): string {
  return body.map((part) => renderPart(part, labels)).join('');
}

function renderPart(part: ResolvedStepBodyPart, labels: LineLabelMap): string {
  switch (part.kind) {
    case 'text':
      return part.value;
    case 'ref':
      return renderRef(part, labels);
    case 'time':
      return `[${formatQty(part.qty.qty)} ${part.qty.unit}](#timer)`;
    case 'temperature':
      return `[${formatQty(part.qty.qty)}°${part.qty.unit}](#temperature)`;
  }
}

function renderRef(
  part: Extract<ResolvedStepBodyPart, { kind: 'ref' }>,
  labels: LineLabelMap
): string {
  if (part.ingredientIndex !== null) {
    const label = labels.get(part.ingredientIndex) ?? `line-${part.ingredientIndex}`;
    return `[${label}](#line-${part.ingredientIndex})`;
  }
  // Slug-only ref (rare in compiled steps; the resolver normally pins these
  // to a block when possible). Fall back to the resolved ingredientId-based
  // anchor so the link still points at something.
  if (part.ingredientId !== null) {
    return `[ingredient-${part.ingredientId}](#ingredient-${part.ingredientId})`;
  }
  return '[?](#unresolved)';
}

function formatQty(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n);
}
