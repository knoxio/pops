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

import { type PendingImport, sourceLabel } from './pending-import-view';

import type { TFunction } from 'i18next';

export interface DiscardCopy {
  title: string;
  body: string;
  action: string;
}

/**
 * What Discard promises, by what is actually at stake. A live import loses
 * nothing but decisions (the bank still has every row and resends them),
 * so the wording must not scare. A file draft loses the decisions AND the
 * way back, because the file is not stored; it has to say which file to
 * upload again. An unusable draft has already lost the decisions, so the
 * confirmation is only about the file.
 */
export function discardCopy(item: PendingImport, t: TFunction<'finance'>): DiscardCopy {
  const label = sourceLabel(
    item.source,
    (first, rest) => t('import.pending.filesMore', { first, count: rest }),
    (provider) => t('import.pending.liveFeed', { provider })
  );
  if (item.source.kind === 'live') {
    const provider = item.source.provider === 'up' ? 'Up' : item.source.provider;
    return {
      title: t('import.pending.discardLiveTitle', { provider }),
      body: t('import.pending.discardLiveBody', { provider, count: item.rowCount }),
      action: t('import.pending.discardLiveAction', { provider }),
    };
  }
  if (item.state === 'unusable') {
    return {
      title: t('import.pending.discardFileTitle', { label }),
      body: t('import.pending.discardUnusableBody', { label }),
      action: t('import.pending.discardAction'),
    };
  }
  const decided = Math.max(0, item.rowCount - item.unresolvedCount);
  return {
    title: t('import.pending.discardFileTitle', { label }),
    body: t('import.pending.discardFileBody', { label, count: decided }),
    action: t('import.pending.discardAction'),
  };
}

export function DiscardPendingDialog({
  item,
  onConfirm,
  onCancel,
}: {
  item: PendingImport | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('finance');
  if (item === null) return null;
  const copy = discardCopy(item, t);
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription>{copy.body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('import.pending.keep')}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            {copy.action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
