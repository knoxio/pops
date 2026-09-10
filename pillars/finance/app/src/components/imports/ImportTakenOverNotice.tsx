import { useTranslation } from 'react-i18next';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@pops/ui';

/**
 * What the tab that lost an import sees (POPS-3331). It blocks, because
 * every edit made here after the take-over would be thrown away, and a
 * wizard that keeps accepting input it will not save is worse than one that
 * stops. The two ways out mirror the card's "Take over": take it back, or
 * leave it to the other tab.
 */
export function ImportTakenOverNotice({
  takenAt,
  onTakeBack,
  onLeave,
}: {
  takenAt: string;
  onTakeBack: () => void;
  onLeave: () => void;
}) {
  const { t } = useTranslation('finance');
  const at = new Date(takenAt).toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
  return (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('import.takenOver.title')}</AlertDialogTitle>
          <AlertDialogDescription>{t('import.takenOver.body', { at })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onLeave}>{t('import.takenOver.leave')}</AlertDialogCancel>
          <AlertDialogAction onClick={onTakeBack}>
            {t('import.takenOver.takeBack')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
