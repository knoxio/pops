import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DiscardPendingDialog } from './DiscardPendingDialog';
import { type PendingImportItem, sortPending } from './pending-import-view';
import { PendingImportCard } from './PendingImportCard';
import { usePendingImports } from './usePendingImports';

/**
 * The cards in the order a person should deal with them, with the discard
 * confirmation wired. `max` caps how many are shown and says how many are
 * not; the wizard's first step shows all of them, the dashboard five.
 */
export function PendingImportList({
  items,
  compact = false,
  max,
}: {
  items: PendingImportItem[];
  compact?: boolean;
  max?: number;
}) {
  const { t } = useTranslation('finance');
  const pending = usePendingImports();
  const [discarding, setDiscarding] = useState<PendingImportItem | null>(null);
  const sorted = sortPending(items);
  const shown = max === undefined ? sorted : sorted.slice(0, max);
  const hidden = sorted.length - shown.length;

  const actions = {
    onOpen: pending.open,
    onTakeOver: pending.takeOver,
    onDiscard: (draftId: string) =>
      setDiscarding(items.find((item) => item.draft.id === draftId) ?? null),
  };

  return (
    <div className="space-y-3">
      {shown.map((item) => (
        <PendingImportCard key={item.draft.id} item={item} actions={actions} compact={compact} />
      ))}
      {hidden > 0 && (
        <p className="text-xs text-muted-foreground">
          {t('import.pending.andMore', { count: hidden })}
        </p>
      )}
      <DiscardPendingDialog
        item={discarding?.draft ?? null}
        onCancel={() => setDiscarding(null)}
        onConfirm={() => {
          if (discarding === null) return;
          void pending.discard(discarding.draft.id);
          setDiscarding(null);
        }}
      />
    </div>
  );
}
