import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';

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

import { unwrap } from '../../lists-api-helpers.js';
import { listCreate } from '../../lists-api/index.js';
import { KindRadioGroup } from './KindRadioGroup.js';
import { DEFAULT_NEW_LIST_KIND, type ListKind } from './list-index-types.js';

import type { ReactElement } from 'react';

interface FormState {
  name: string;
  kind: ListKind;
}

const EMPTY_FORM: FormState = { name: '', kind: DEFAULT_NEW_LIST_KIND };

/**
 * "+ New list" modal. The URL marker is `?new=1` on top of `/lists`, NOT a
 * separate `/lists/new` route (see pillars/lists/docs/prds/crud-ui §Routes).
 *
 * The modal is uncontrolled at the component boundary: the URL query param
 * is the source of truth so the modal is deep-linkable + survives reloads.
 */
export function ListNewModal(): ReactElement {
  const { t } = useTranslation('lists');
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const open = params.get('new') === '1';

  const qc = useQueryClient();
  const createMutation = useMutation({
    mutationFn: async (input: FormState) => unwrap(await listCreate({ body: input })),
    onSuccess: ({ id }) => {
      void qc.invalidateQueries({ queryKey: ['lists', 'list'] });
      toast.success(t('new.toast.created'));
      void navigate(`/lists/${id}`);
    },
    onError: (err: Error) => {
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

function shoppingPlaceholder(today: Date): string {
  // Date is ISO calendar form, not locale-aware — the spec literal pins it
  // (pillars/lists/docs/prds/crud-ui §Create modal).
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `Shopping list — ${yyyy}-${mm}-${dd}`;
}

function useNewListForm(): {
  form: FormState;
  setForm: (updater: (prev: FormState) => FormState) => void;
  trimmed: string;
} {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  // Reset the form whenever the modal is freshly mounted — the URL marker
  // is the source of truth, so unmounting on close also clears form state.
  useEffect(() => {
    setForm(EMPTY_FORM);
  }, []);
  return { form, setForm, trimmed: form.name.trim() };
}

function NewListForm({ isSubmitting, onSubmit, onCancel }: FormProps): ReactElement {
  const { t } = useTranslation('lists');
  const { form, setForm, trimmed } = useNewListForm();
  const canSubmit = !isSubmitting && trimmed.length > 0;
  const isShopping = form.kind === 'shopping';
  const placeholder = isShopping
    ? shoppingPlaceholder(new Date())
    : t('new.fields.namePlaceholder');

  // Shopping name auto-fills on focus if still empty.
  const onNameFocus = (): void => {
    if (isShopping && form.name === '') {
      setForm((prev) => ({ ...prev, name: shoppingPlaceholder(new Date()) }));
    }
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        onSubmit({ name: trimmed, kind: form.kind });
      }}
    >
      <NameField
        value={form.name}
        onChange={(name) => setForm((prev) => ({ ...prev, name }))}
        onFocus={onNameFocus}
        placeholder={placeholder}
        labelText={t('new.fields.nameLabel')}
        disabled={isSubmitting}
      />
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

interface NameFieldProps {
  value: string;
  onChange: (next: string) => void;
  onFocus: () => void;
  placeholder: string;
  labelText: string;
  disabled: boolean;
}

function NameField({
  value,
  onChange,
  onFocus,
  placeholder,
  labelText,
  disabled,
}: NameFieldProps): ReactElement {
  return (
    <div className="space-y-2">
      <label htmlFor="list-new-name" className="text-sm font-medium">
        {labelText}
      </label>
      <Input
        id="list-new-name"
        name="name"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        placeholder={placeholder}
        required
        autoFocus
        disabled={disabled}
      />
    </div>
  );
}
