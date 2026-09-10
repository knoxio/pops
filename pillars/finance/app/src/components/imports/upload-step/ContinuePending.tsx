import { useTranslation } from 'react-i18next';

import { Separator } from '@pops/ui';

import { PendingImportList } from '../pending/PendingImportList';
import { usePendingImports } from '../pending/usePendingImports';

/**
 * What was started and not finished, ahead of starting another. A section
 * and not a modal because the modal only ever knew about the one draft in
 * this browser; with drafts on the server and a bank feeding some of them,
 * there can be several, and a person picking an account below should see
 * that one of them already has that account's rows waiting. Renders nothing
 * when nothing is pending, divider included.
 */
export function ContinuePending() {
  const { t } = useTranslation('finance');
  const { items } = usePendingImports();
  if (items === undefined || items.length === 0) return null;
  return (
    <>
      <section className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
        <div>
          <h2 className="text-sm font-semibold">{t('import.pending.continueTitle')}</h2>
          <p className="text-xs text-muted-foreground">{t('import.pending.continueHint')}</p>
        </div>
        <PendingImportList items={items} compact />
      </section>
      <div className="flex items-center gap-3 pt-2">
        <Separator className="flex-1" />
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {t('import.pending.orStartNew')}
        </span>
        <Separator className="flex-1" />
      </div>
    </>
  );
}
