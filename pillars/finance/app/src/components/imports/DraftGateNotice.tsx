import { useTranslation } from 'react-i18next';

import { Alert, AlertDescription, AlertTitle, Button } from '@pops/ui';

import type { DraftGate } from './hooks/useDraftHydration';

/**
 * What the import page shows instead of the wizard when the draft in the
 * URL cannot simply be opened: unusable (discard is the one action) or held
 * by another tab (take it over here). Every other gate state renders nothing.
 */
export function DraftGateNotice({
  gate,
  onDiscard,
  onTakeOver,
}: {
  gate: DraftGate;
  onDiscard: () => void;
  onTakeOver: () => void;
}) {
  const { t } = useTranslation('finance');
  if (gate.status === 'unusable') {
    return (
      <Alert variant="destructive">
        <AlertTitle>{t('import.draft.unusableTitle')}</AlertTitle>
        <AlertDescription>
          <p>{gate.reason}</p>
          <Button size="sm" variant="destructive" onClick={onDiscard}>
            {t('import.draft.discard')}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  if (gate.status === 'owned-elsewhere') {
    return (
      <Alert>
        <AlertTitle>{t('import.draft.ownedElsewhereTitle')}</AlertTitle>
        <AlertDescription>
          <p>{t('import.draft.ownedElsewhereBody')}</p>
          <Button size="sm" onClick={onTakeOver}>
            {t('import.draft.takeOver')}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  return null;
}
