/**
 * Confirmation modal for deleting an ingredient.
 *
 * The server returns one of three outcomes:
 *   1. `{ ok: true }` — ingredient gone, dialog closes.
 *   2. `{ ok: false, blockers }` — variants and/or aliases reference the row;
 *      shown as a localised list, the Delete button stays disabled.
 *   3. `TRPCError` with code 'CONFLICT' for FK violations not enumerated by
 *      `getIngredientDeleteBlockers` (recipe_lines, batches, substitutions,
 *      yield_ingredient_id). Surfaced as the generic "other refs" message.
 */
import { useTranslation } from 'react-i18next';

import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@pops/ui';

import type { DeleteBlockerSummary, IngredientRow } from '@pops/app-food-db';

interface Props {
  open: boolean;
  ingredient: IngredientRow;
  blockers: DeleteBlockerSummary | null;
  recipeRefCount: number;
  hasOtherFkRefs: boolean;
  isSubmitting: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

interface BlockerListProps {
  blockers: DeleteBlockerSummary | null;
  recipeRefCount: number;
  hasOtherFkRefs: boolean;
}

interface BlockerLine {
  key: string;
  text: string;
}

function buildBlockerLines(
  props: BlockerListProps,
  t: (key: string, opts?: Record<string, unknown>) => string
): BlockerLine[] {
  const variants = props.blockers?.variants ?? 0;
  const aliases = props.blockers?.aliases ?? 0;
  const lines: BlockerLine[] = [];
  if (variants > 0) {
    lines.push({
      key: 'variants',
      text: t('data.ingredients.delete.blockers.variants', { count: variants }),
    });
  }
  if (aliases > 0) {
    lines.push({
      key: 'aliases',
      text: t('data.ingredients.delete.blockers.aliases', { count: aliases }),
    });
  }
  if (props.recipeRefCount > 0) {
    lines.push({
      key: 'recipes',
      text: t('data.ingredients.delete.blockers.recipes', { count: props.recipeRefCount }),
    });
  }
  if (props.hasOtherFkRefs) {
    lines.push({ key: 'other', text: t('data.ingredients.delete.blockers.otherRefs') });
  }
  return lines;
}

function BlockerList(props: BlockerListProps) {
  const { t } = useTranslation('food');
  const lines = buildBlockerLines(props, t);
  if (lines.length === 0) return null;
  return (
    <div role="alert" className="rounded border border-destructive/40 bg-destructive/5 p-3 text-sm">
      <p className="font-medium">{t('data.ingredients.delete.blockers.heading')}</p>
      <ul className="mt-1 list-disc pl-5">
        {lines.map((line) => (
          <li key={line.key}>{line.text}</li>
        ))}
      </ul>
    </div>
  );
}

export function DeleteIngredientDialog({
  open,
  ingredient,
  blockers,
  recipeRefCount,
  hasOtherFkRefs,
  isSubmitting,
  errorMessage,
  onCancel,
  onConfirm,
}: Props) {
  const { t } = useTranslation('food');
  const isBlocked =
    (blockers?.variants ?? 0) > 0 ||
    (blockers?.aliases ?? 0) > 0 ||
    recipeRefCount > 0 ||
    hasOtherFkRefs;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onCancel())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('data.ingredients.delete.title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm">
            {t('data.ingredients.delete.confirmPrompt', { name: ingredient.name })}
          </p>
          <BlockerList
            blockers={blockers}
            recipeRefCount={recipeRefCount}
            hasOtherFkRefs={hasOtherFkRefs}
          />
          {errorMessage !== null ? (
            <p role="alert" className="text-destructive text-sm">
              {errorMessage}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('data.ingredients.actions.cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isSubmitting || isBlocked}
            onClick={onConfirm}
          >
            {isSubmitting
              ? t('data.ingredients.actions.deleting')
              : t('data.ingredients.delete.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
