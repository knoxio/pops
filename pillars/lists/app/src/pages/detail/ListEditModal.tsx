import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { LIST_KINDS, type ListKind, type ListRow } from './types.js';

/**
 * Edit modal: rename + change kind. Implements the "+ Archive / Restore"
 * button at the bottom per PRD-140 §Edit modal. The kind-change warning
 * surfaces when the user picks a kind different from the current one.
 *
 * No URL params here — the modal is controlled by the page's local state
 * (the `?edit=1` route convention from the PRD will land alongside 140-B
 * when the index page introduces the parent route shape).
 */
export interface ListEditModalProps {
  list: ListRow;
  isSaving: boolean;
  onCancel: () => void;
  onSave: (patch: { name: string; kind: ListKind }) => void;
  onArchiveToggle: () => void;
}

function useEditFormState(list: ListRow) {
  const [name, setName] = useState(list.name);
  const [kind, setKind] = useState<ListKind>(list.kind);
  const [nameError, setNameError] = useState<string | null>(null);
  useEffect(() => {
    setName(list.name);
    setKind(list.kind);
  }, [list]);
  return { name, setName, kind, setKind, nameError, setNameError };
}

export function ListEditModal(props: ListEditModalProps): React.ReactElement {
  const { t } = useTranslation('lists');
  const state = useEditFormState(props.list);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = state.name.trim();
    if (trimmed.length === 0) {
      state.setNameError(t('detail.edit.nameRequired'));
      return;
    }
    props.onSave({ name: trimmed, kind: state.kind });
  };

  return (
    <Dialog labelledBy="list-edit-title" onCancel={props.onCancel}>
      <h2 id="list-edit-title" className="text-lg font-semibold">
        {t('detail.edit.title')}
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <NameField
          value={state.name}
          error={state.nameError}
          onChange={(value) => {
            state.setName(value);
            if (state.nameError !== null) state.setNameError(null);
          }}
        />
        <KindField current={props.list.kind} value={state.kind} onChange={state.setKind} />
        <EditActions
          isArchived={props.list.archivedAt !== null}
          isSaving={props.isSaving}
          onCancel={props.onCancel}
          onArchiveToggle={props.onArchiveToggle}
        />
      </form>
    </Dialog>
  );
}

function NameField({
  value,
  error,
  onChange,
}: {
  value: string;
  error: string | null;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation('lists');
  return (
    <div className="space-y-1">
      <label htmlFor="list-edit-name" className="block text-sm font-medium">
        {t('detail.edit.name')}
      </label>
      <input
        id="list-edit-name"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={200}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        autoFocus
      />
      {error !== null ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function KindField({
  current,
  value,
  onChange,
}: {
  current: ListKind;
  value: ListKind;
  onChange: (kind: ListKind) => void;
}) {
  const { t } = useTranslation('lists');
  const kindChanged = value !== current;
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{t('detail.edit.kind')}</legend>
      <div className="grid grid-cols-2 gap-2">
        {LIST_KINDS.map((option) => (
          <label
            key={option}
            className="flex items-center gap-2 rounded-md border p-2 text-sm hover:bg-muted"
          >
            <input
              type="radio"
              name="kind"
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
            />
            {t(`detail.kind.${option}`)}
          </label>
        ))}
      </div>
      {kindChanged ? (
        <p className="text-xs text-muted-foreground" role="status">
          {t('detail.edit.kindWarning')}
        </p>
      ) : null}
    </fieldset>
  );
}

function EditActions({
  isArchived,
  isSaving,
  onCancel,
  onArchiveToggle,
}: {
  isArchived: boolean;
  isSaving: boolean;
  onCancel: () => void;
  onArchiveToggle: () => void;
}) {
  const { t } = useTranslation('lists');
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
      <button
        type="button"
        onClick={onArchiveToggle}
        className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
      >
        {isArchived ? t('detail.menu.restore') : t('detail.menu.archive')}
      </button>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          {t('detail.edit.cancel')}
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isSaving ? t('detail.edit.saving') : t('detail.edit.save')}
        </button>
      </div>
    </div>
  );
}

function Dialog({
  children,
  labelledBy,
  onCancel,
}: {
  children: React.ReactNode;
  labelledBy: string;
  onCancel: () => void;
}) {
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [onCancel]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-md space-y-4 rounded-lg border bg-background p-6 shadow-lg sm:max-w-md">
        {children}
      </div>
    </div>
  );
}
