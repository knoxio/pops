import { AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@pops/ui';

/**
 * Inline reference chip rendered inside a step body. Clicking scrolls the
 * matching ingredient list row into view (the caller wires the anchor by
 * giving each `<li>` an `id` derived from `position`). When the resolver
 * couldn't bind the ref the chip shows an error badge but stays clickable.
 *
 * Built on `<a>` so it's a real link — keyboard focusable, in-page anchor,
 * works with `Tab` traversal without `tabIndex` overrides.
 */
export interface IngredientChipProps {
  /** Human label shown in the chip. */
  label: string;
  /** When set, the chip becomes a link to `#line-{lineAnchor}`. */
  lineAnchor?: number | null;
  /** When set (and no `lineAnchor`), the chip links to `#ingredient-{ingredientAnchor}`. */
  ingredientAnchor?: string | null;
  /** Resolver failed to bind this ref — show an error badge + destructive style. */
  hasError?: boolean;
  /** Optional title (full descriptor) shown on hover. */
  title?: string;
}

function resolveHref(
  lineAnchor: number | null | undefined,
  ingredientAnchor: string | null | undefined
): string {
  if (typeof lineAnchor === 'number') return `#line-${lineAnchor}`;
  if (ingredientAnchor) return `#ingredient-${ingredientAnchor}`;
  return '#unresolved';
}

const baseClasses =
  'inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-xs font-medium ' +
  'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
  'no-underline align-baseline';

const styleByState = {
  ok: 'border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground',
  error: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
};

export function IngredientChip({
  label,
  lineAnchor,
  ingredientAnchor,
  hasError = false,
  title,
}: IngredientChipProps) {
  const { t } = useTranslation('food');

  const href = resolveHref(lineAnchor, ingredientAnchor);

  return (
    <a
      href={href}
      title={title ?? label}
      aria-label={t('renderer.refAria', { name: label })}
      className={cn(baseClasses, hasError ? styleByState.error : styleByState.ok)}
      data-testid="ingredient-chip"
      data-has-error={hasError ? 'true' : 'false'}
    >
      {hasError ? (
        <AlertCircle
          className="h-3 w-3"
          aria-label={t('renderer.refError')}
          data-testid="ingredient-chip-error"
        />
      ) : null}
      <span>{label}</span>
    </a>
  );
}
