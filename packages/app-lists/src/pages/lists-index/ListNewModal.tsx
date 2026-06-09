import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';
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

import { KindRadioGroup } from './KindRadioGroup.js';
import { DEFAULT_NEW_LIST_KIND, type ListKind } from './list-index-types.js';

import type { ReactElement } from 'react';

interface FormState {
  name: string;
  kind: ListKind;
}

const EMPTY_FORM: FormState = { name: '', kind: DEFAULT_NEW_LIST_KIND };

/**
 * "+ New list" modal. Overlay-on-index per PRD-140 §Routes — the URL marker
 * is `?new=1` on top of `/lists`, NOT a separate `/lists/new` route (the
 * standalone route was explicitly dropped per the 2026-06-08 audit fix
 * recorded in the food-app roadmap).
 *
 * The modal is uncontrolled at the component boundary: the URL query param
 * is the source of truth so the modal is deep-linkable + survives reloads.
 */
export function ListNewModal(): ReactElement {
  const { t } = useTranslation('lists');
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const open = params.get('new') === '1';

  const utils = trpc.useUtils();
  const createMutation = trpc.lists.list.create.useMutation({
    onSuccess: ({ id }) => {
      toast.success(t('new.toast.created'));
      void utils.lists.list.list.invalidate();
      // Navigate per PRD-140 §Create. The detail route lands in PRD-140
      // part C; until then this 404s and the user back-buttons to the
      // index, where the new list is now visible (cache was invalidated).
      void navigate(`/lists/${id}`);
    },
    onError: (err) => {
      toast.error(t('new.toast.error', { message: err.message }));
    },
  });

  const closeModal = useCallback(() => {
    const next = new URLSearchParams(params);
    next.delete('new');
    setParams(next, { replace: true });
  }, [params, setParams]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeModal();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('new.title')}</DialogTitle>
          <DialogDescription>{t('new.description')}</DialogDescription>
        </DialogHeader>
        <NewListForm
          isSubmitting={createMutation.isPending}
          onSubmit={(form) => createMutation.mutate(form)}
          onCancel={closeModal}
        />
      </DialogContent>
    </Dialog>
  );
}

interface FormProps {
  isSubmitting: boolean;
  onSubmit: (form: FormState) => void;
  onCancel: () => void;
}

function NewListForm({ isSubmitting, onSubmit, onCancel }: FormProps): ReactElement {
  const { t } = useTranslation('lists');
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const trimmed = form.name.trim();
  const canSubmit = !isSubmitting && trimmed.length > 0;

  // Reset the form whenever the modal is freshly mounted — the URL marker
  // is the source of truth, so unmounting on close also clears form state.
  useEffect(() => {
    setForm(EMPTY_FORM);
  }, []);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        onSubmit({ name: trimmed, kind: form.kind });
      }}
    >
      <div className="space-y-2">
        <label htmlFor="list-new-name" className="text-sm font-medium">
          {t('new.fields.nameLabel')}
        </label>
        <Input
          id="list-new-name"
          name="name"
          value={form.name}
          onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          placeholder={t('new.fields.namePlaceholder')}
          required
          autoFocus
          disabled={isSubmitting}
        />
      </div>
      <div className="space-y-2">
        <span className="text-sm font-medium">{t('new.fields.kindLabel')}</span>
        <KindRadioGroup
          value={form.kind}
          onChange={(kind) => setForm((prev) => ({ ...prev, kind }))}
          disabled={isSubmitting}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          {t('new.actions.cancel')}
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {isSubmitting ? t('new.actions.submitting') : t('new.actions.submit')}
        </Button>
      </DialogFooter>
    </form>
  );
}
