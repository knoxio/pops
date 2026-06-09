/**
 * Send-to-list modal — PRD-142.
 *
 * Wraps `food.recipes.prepareSendToList` + `food.recipes.sendToList`. The
 * detail page mounts this under PRD-119's `RecipeScaleProvider` so the
 * scale factor flows in via `useRecipeScale()`.
 *
 * Per PRD §UI:
 *  - existing-list radio defaults selected when at least one shopping list
 *    exists; otherwise the modal auto-selects "create new"
 *  - the create-new name prefills `Shopping list — yyyy-MM-dd`
 *  - send button label dynamically shows the item count
 *  - closing mid-flight does NOT cancel the server work (PRD §Business
 *    Rules) — onOpenChange just hides the modal
 */
import { useEffect, useState, type FormEvent, type ReactElement } from 'react';
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

import { useRecipeScale } from '../RecipeScaleProvider.js';
import { formatPrefillListName } from './format-prefill-name.js';
import { SendToListPreview } from './SendToListPreview.js';
import { SendToListTargetPicker } from './SendToListTargetPicker.js';
import { useSendToListData } from './useSendToListData.js';
import { type SendOutcome, useSendToListMutation } from './useSendToListMutation.js';

import type { FormState } from './types.js';

export interface SendToListModalProps {
  open: boolean;
  versionId: number;
  onOpenChange: (open: boolean) => void;
  onSuccess: (outcome: SendOutcome & { listName: string }) => void;
}

export function SendToListModal({
  open,
  versionId,
  onOpenChange,
  onSuccess,
}: SendToListModalProps): ReactElement {
  const { scaleFactor } = useRecipeScale();
  const data = useSendToListData({ versionId, scaleFactor, enabled: open });
  const [form, setForm] = useState<FormState>(initialForm);
  useEffect(() => {
    if (!open) setForm(initialForm);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    setForm((prev) => seedFormFromData(prev, data.shoppingLists.length > 0));
  }, [open, data.shoppingLists.length]);
  const mutation = useSendToListMutation({
    onSuccess: (outcome) => {
      const listName = resolveListName(form, data.shoppingLists, outcome.listId);
      onSuccess({ ...outcome, listName });
      onOpenChange(false);
    },
  });
  const itemCount =
    (data.preview?.canonicalItems.length ?? 0) + (data.preview?.unconvertedItems.length ?? 0);
  const canSubmit = computeCanSubmit(form, data.isLoading, mutation.isPending, itemCount);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <ModalHeader preview={data.preview} />
        <SendToListBody data={data} form={form} setForm={setForm} />
        {mutation.errorMessage !== null && (
          <p className="text-sm text-destructive" role="alert">
            {mutation.errorMessage}
          </p>
        )}
        <ModalFooter
          itemCount={itemCount}
          canSubmit={canSubmit}
          isPending={mutation.isPending}
          onCancel={() => onOpenChange(false)}
          onSubmit={() => mutation.submit(buildSubmitInput(versionId, scaleFactor, form))}
        />
      </DialogContent>
    </Dialog>
  );
}

function ModalHeader({
  preview,
}: {
  preview: ReturnType<typeof useSendToListData>['preview'];
}): ReactElement {
  const { t } = useTranslation('food');
  return (
    <DialogHeader>
      <DialogTitle>{t('recipes.detail.sendToList.dialog.title')}</DialogTitle>
      {preview !== undefined && (
        <DialogDescription>
          {t('recipes.detail.sendToList.dialog.subtitle', {
            title: preview.recipeTitle,
            scale: preview.scaleFactor,
          })}
        </DialogDescription>
      )}
    </DialogHeader>
  );
}

interface ModalFooterProps {
  itemCount: number;
  canSubmit: boolean;
  isPending: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}

function ModalFooter({
  itemCount,
  canSubmit,
  isPending,
  onCancel,
  onSubmit,
}: ModalFooterProps): ReactElement {
  const { t } = useTranslation('food');
  return (
    <DialogFooter>
      <Button variant="ghost" onClick={onCancel}>
        {t('recipes.detail.sendToList.dialog.cancel')}
      </Button>
      <form
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          if (canSubmit) onSubmit();
        }}
      >
        <Button type="submit" disabled={!canSubmit}>
          {isPending
            ? t('recipes.detail.sendToList.dialog.sending')
            : t('recipes.detail.sendToList.dialog.send', { count: itemCount })}
        </Button>
      </form>
    </DialogFooter>
  );
}

const initialForm: FormState = { kind: 'new', listId: null, newName: '' };

function seedFormFromData(prev: FormState, hasExistingLists: boolean): FormState {
  const kind = hasExistingLists && prev.listId === null ? 'existing' : prev.kind;
  const newName = prev.newName === '' ? formatPrefillListName(new Date()) : prev.newName;
  return { ...prev, kind, newName };
}

function resolveListName(
  form: FormState,
  shoppingLists: ReturnType<typeof useSendToListData>['shoppingLists'],
  resultListId: number
): string {
  if (form.kind === 'new') return form.newName.trim();
  const match = shoppingLists.find((l) => l.id === resultListId);
  return match?.name ?? '';
}

function computeCanSubmit(
  form: FormState,
  isLoading: boolean,
  isPending: boolean,
  itemCount: number
): boolean {
  if (isLoading || isPending || itemCount === 0) return false;
  if (form.kind === 'existing') return form.listId !== null;
  return form.newName.trim().length > 0;
}

function buildSubmitInput(versionId: number, scaleFactor: number, form: FormState) {
  if (form.kind === 'existing' && form.listId !== null) {
    return {
      versionId,
      scaleFactor,
      target: { kind: 'existing' as const, listId: form.listId },
    };
  }
  return {
    versionId,
    scaleFactor,
    target: { kind: 'new' as const, name: form.newName.trim() },
  };
}

function SendToListBody({
  data,
  form,
  setForm,
}: {
  data: ReturnType<typeof useSendToListData>;
  form: FormState;
  setForm: (next: FormState) => void;
}): ReactElement {
  const { t } = useTranslation('food');
  if (data.isLoading || data.preview === undefined) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {t('recipes.detail.sendToList.loading')}
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <SendToListTargetPicker
        form={form}
        setForm={setForm}
        shoppingLists={data.shoppingLists}
        alreadySentToListIds={data.preview.alreadySentToListIds}
      />
      <SendToListPreview preview={data.preview} />
    </div>
  );
}
