/**
 * Confirmation modal for deleting a variant. Distinct from
 * `DeleteIngredientDialog` because the blocker model is simpler: the
 * server returns `NOT_FOUND` or a SQLite FK violation (mapped to
 * CONFLICT) — there's no row-counting query for variants. The dialog
 * shows the generic "referenced" copy when the API returns CONFLICT.
 */
import { useTranslation } from 'react-i18next';

import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@pops/ui';

import type { IngredientVariantRow } from './ingredient-wire-types.js';

interface Props {
  variant: IngredientVariantRow;
  isSubmitting: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteVariantDialog({
  variant,
  isSubmitting,
  errorMessage,
  onCancel,
  onConfirm,
}: Props) {
  const { t } = useTranslation('food');
  return (
    <Dialog open onOpenChange={(next) => (next ? null : onCancel())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('data.ingredients.variants.delete.title')}</DialogTitle>
        </DialogHeader>
        <p className="text-sm">
          {t('data.ingredients.variants.delete.confirmPrompt', { slug: variant.slug })}
        </p>
        {errorMessage !== null ? (
          <p role="alert" className="text-destructive text-sm">
            {errorMessage}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('data.ingredients.actions.cancel')}
          </Button>
          <Button type="button" variant="destructive" disabled={isSubmitting} onClick={onConfirm}>
            {isSubmitting
              ? t('data.ingredients.actions.deleting')
              : t('data.ingredients.delete.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
