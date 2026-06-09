import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@pops/ui';

interface Props {
  open: boolean;
  title: string;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirm dialog for archiving a whole recipe. Renders as a simple overlay
 * — the codebase has a heavier shadcn `Dialog` primitive but using it
 * here would pull a transitive `@radix-ui/react-dialog` dep that the
 * food package doesn't already carry. PRD-119-E can swap to a shared
 * dialog when the design system upgrade lands.
 */
export function RecipeArchiveDialog({
  open,
  title,
  isPending,
  onConfirm,
  onCancel,
}: Props): ReactElement | null {
  const { t } = useTranslation('food');
  const [confirmText, setConfirmText] = useState('');
  if (!open) return null;
  const canConfirm = confirmText.length > 0;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recipe-archive-title"
    >
      <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-lg">
        <h2 id="recipe-archive-title" className="text-lg font-semibold">
          {t('recipes.detail.archive.title', { title })}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{t('recipes.detail.archive.body')}</p>
        <label className="mt-4 block text-sm">
          {t('recipes.detail.archive.confirmLabel')}
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={t('recipes.detail.archive.confirmPlaceholder')}
            className="mt-1 block w-full rounded border bg-background px-2 py-1"
            aria-label={t('recipes.detail.archive.confirmLabel')}
          />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={isPending}>
            {t('recipes.detail.archive.cancel')}
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={!canConfirm || isPending}>
            {isPending ? t('recipes.detail.archive.pending') : t('recipes.detail.archive.confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}
