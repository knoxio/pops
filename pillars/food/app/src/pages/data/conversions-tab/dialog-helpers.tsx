/**
 * Tiny shared bits used by every conversions dialog so the per-dialog
 * function body stays under the 60-line per-function lint cap.
 */
import { useTranslation } from 'react-i18next';

import { Button, DialogFooter } from '@pops/ui';

export function FormError({ message }: { message: string | null }) {
  if (message === null) return null;
  return (
    <p role="alert" className="text-destructive text-sm">
      {message}
    </p>
  );
}

export function DialogActions({
  isSubmitting,
  onCancel,
}: {
  isSubmitting: boolean;
  onCancel: () => void;
}) {
  const { t } = useTranslation('food');
  return (
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onCancel}>
        {t('data.conversions.cancel')}
      </Button>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? t('data.conversions.submitting') : t('data.conversions.save')}
      </Button>
    </DialogFooter>
  );
}
