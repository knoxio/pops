/**
 * Add-prep-state dialog (pillars/food/docs/prds/data-page).
 *
 * Prep states have heavy reference impact (every recipe_line references
 * one), so v1 only supports add — no rename, no delete. The dialog
 * collects a slug + name pair; submit fires `onSubmit`, which the parent
 * wires to the `POST /prep-states` REST endpoint.
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
  Input,
} from '@pops/ui';

export interface AddPrepStateDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: (input: { slug: string; name: string }) => void;
  readonly isSubmitting?: boolean;
}

export function AddPrepStateDialog(props: AddPrepStateDialogProps) {
  const { open, onOpenChange, onSubmit, isSubmitting } = props;
  const { t } = useTranslation('food');
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');

  function resetAndClose(next: boolean): void {
    if (!next) {
      setSlug('');
      setName('');
    }
    onOpenChange(next);
  }

  const disabled = isSubmitting === true || slug.trim().length === 0 || name.trim().length === 0;

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('data.prepStates.add.title')}</DialogTitle>
          <DialogDescription>{t('data.prepStates.add.description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t('data.prepStates.add.slugLabel')}</span>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder={t('data.prepStates.add.slugPlaceholder')}
              aria-label={t('data.prepStates.add.slugLabel')}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t('data.prepStates.add.nameLabel')}</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('data.prepStates.add.namePlaceholder')}
              aria-label={t('data.prepStates.add.nameLabel')}
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => resetAndClose(false)}>
            {t('data.prepStates.add.cancel')}
          </Button>
          <Button
            onClick={() => onSubmit({ slug: slug.trim(), name: name.trim() })}
            disabled={disabled}
          >
            {t('data.prepStates.add.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
