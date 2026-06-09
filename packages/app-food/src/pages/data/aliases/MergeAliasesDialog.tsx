/**
 * Merge-aliases dialog (PRD-122-C).
 *
 * Pick a canonical target; the selected alias rows re-point at it inside
 * one server-side transaction. Rows already at the chosen target are
 * skipped silently (handled at the service layer).
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pops/ui';

import { AliasTargetPicker } from './AliasTargetPicker';

import type { AliasRow, AliasTarget } from './types';

export interface MergeAliasesDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: (target: AliasTarget) => void;
  readonly selectedAliases: readonly AliasRow[];
  readonly isSubmitting?: boolean;
}

export function MergeAliasesDialog({
  open,
  onOpenChange,
  onSubmit,
  selectedAliases,
  isSubmitting,
}: MergeAliasesDialogProps) {
  const { t } = useTranslation('food');
  const [target, setTarget] = useState<AliasTarget | null>(null);

  function resetAndClose(next: boolean): void {
    if (!next) setTarget(null);
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('data.aliases.merge.title')}</DialogTitle>
          <DialogDescription>
            {t('data.aliases.merge.description', { count: selectedAliases.length })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <ul className="border-input max-h-32 space-y-1 overflow-y-auto rounded-md border px-3 py-2 text-sm">
            {selectedAliases.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-2">
                <span>{row.alias}</span>
                <span className="text-muted-foreground text-xs">{row.target.slug}</span>
              </li>
            ))}
          </ul>
          <fieldset className="space-y-1 text-sm">
            <legend className="font-medium">{t('data.aliases.merge.targetLabel')}</legend>
            <AliasTargetPicker value={target} onChange={setTarget} />
          </fieldset>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => resetAndClose(false)}>
            {t('data.aliases.merge.cancel')}
          </Button>
          <Button
            onClick={() => target !== null && onSubmit(target)}
            disabled={target === null || isSubmitting === true}
          >
            {t('data.aliases.merge.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
