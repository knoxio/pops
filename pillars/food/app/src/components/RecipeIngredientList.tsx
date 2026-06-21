import { useTranslation } from 'react-i18next';

import { cn } from '@pops/ui';

import { formatQty, lineAnchorId, lineCanonicalQty } from './RecipeRenderer.helpers';

import type { RecipeLineWithResolved } from './recipe-render-types.js';

/**
 * Each `<li>` carries an `id` derived from the line's `position` so step
 * body chips can scroll the matching row into view via `#line-N` anchors.
 * Scaling multiplies the canonical quantity; the original-text aside is
 * left unscaled because it is the literal the user typed.
 */
export interface RecipeIngredientListProps {
  lines: RecipeLineWithResolved[];
  scaleFactor: number;
}

interface LineDescriptorArgs {
  ingredientName: string;
  variantName: string | null;
  prepStateName: string | null;
}

/**
 * Assemble the human descriptor from joined names. PRD line 125 example:
 * `banana:raw:mashed` → "Raw mashed banana". We follow the descriptor order
 * "<prep> <variant> <ingredient>" — variant + prep stack as adjectives in
 * front of the canonical noun. Caller capitalises the first letter.
 */
function buildLineDescriptor({
  ingredientName,
  variantName,
  prepStateName,
}: LineDescriptorArgs): string {
  const parts = [prepStateName, variantName, ingredientName].filter(Boolean) as string[];
  const joined = parts.join(' ');
  return joined.length > 0 ? joined.charAt(0).toUpperCase() + joined.slice(1) : ingredientName;
}

export function RecipeIngredientList({ lines, scaleFactor }: RecipeIngredientListProps) {
  const { t } = useTranslation('food');

  if (lines.length === 0) return null;

  return (
    <section data-testid="recipe-ingredients">
      <h2 className="text-xl font-semibold">{t('renderer.ingredientsHeading')}</h2>
      <ol className="mt-2 space-y-1">
        {lines.map((line) => (
          <li
            key={line.id}
            id={lineAnchorId(line.position)}
            className="text-sm"
            data-testid="recipe-ingredient-row"
            data-line-position={line.position}
          >
            <IngredientLineContent line={line} scaleFactor={scaleFactor} t={t} />
          </li>
        ))}
      </ol>
    </section>
  );
}

interface IngredientLineContentProps {
  line: RecipeLineWithResolved;
  scaleFactor: number;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function IngredientLineContent({ line, scaleFactor, t }: IngredientLineContentProps) {
  const canonicalQty = lineCanonicalQty(line);
  const descriptor = buildLineDescriptor({
    ingredientName: line.ingredientName,
    variantName: line.variantName,
    prepStateName: line.prepStateName,
  });

  return (
    <span className={cn(line.optional && 'opacity-80')}>
      <span className="text-muted-foreground mr-1">{line.position}.</span>
      {canonicalQty !== null ? (
        <span data-testid="ingredient-canonical-qty">
          {formatQty(canonicalQty * scaleFactor)} {line.canonicalUnit}
        </span>
      ) : (
        <span data-testid="ingredient-original-only">{line.originalText}</span>
      )}{' '}
      {line.isRecipeRef && line.recipeRefSlug ? (
        <a
          href={`/food/recipes/${line.recipeRefSlug}`}
          className="font-medium underline-offset-2 hover:underline"
          data-testid="ingredient-recipe-ref-link"
        >
          {line.recipeRefTitle ?? descriptor}
        </a>
      ) : (
        <span className="font-medium">{descriptor}</span>
      )}
      {canonicalQty !== null && line.canonicalUnit !== line.originalUnit ? (
        <span className="text-muted-foreground ml-1 text-xs">
          (
          {t('renderer.originalText', {
            text: `${formatQty(line.originalQty)} ${line.originalUnit}`,
          })}
          )
        </span>
      ) : null}
      {line.optional ? (
        <span className="text-muted-foreground ml-1 text-xs">({t('renderer.optional')})</span>
      ) : null}
      {line.notes ? (
        <span
          className="text-muted-foreground block pl-4 text-xs italic"
          data-testid="ingredient-notes"
        >
          {line.notes}
        </span>
      ) : null}
    </span>
  );
}
