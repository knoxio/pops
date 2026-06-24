import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Inline add-item form rendered at the bottom of the list. Pressing Enter in
 * the label input fires the mutation and clears for the next item. The
 * optional qty + unit inputs collapse by default and expand on click.
 */
export interface ListItemAddFormProps {
  isPending: boolean;
  onAdd: (input: { label: string; qty: number | null; unit: string | null }) => Promise<boolean>;
}

interface FormState {
  label: string;
  qty: string;
  unit: string;
}

const EMPTY_FORM: FormState = { label: '', qty: '', unit: '' };

function parseForm(
  state: FormState
): { label: string; qty: number | null; unit: string | null } | null {
  const trimmedLabel = state.label.trim();
  if (trimmedLabel.length === 0) return null;
  const parsedQty = state.qty.trim().length === 0 ? null : Number(state.qty);
  if (parsedQty !== null && !Number.isFinite(parsedQty)) return null;
  const trimmedUnit = state.unit.trim().length === 0 ? null : state.unit.trim();
  return { label: trimmedLabel, qty: parsedQty, unit: trimmedUnit };
}

export function ListItemAddForm(props: ListItemAddFormProps): React.ReactElement {
  const { t } = useTranslation('lists');
  const [state, setState] = useState<FormState>(EMPTY_FORM);
  const [expanded, setExpanded] = useState(false);

  const submit = async () => {
    const parsed = parseForm(state);
    if (parsed === null) return;
    const ok = await props.onAdd(parsed);
    if (ok) setState(EMPTY_FORM);
  };
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-md border border-dashed p-3">
      <LabelRow
        label={state.label}
        onChange={(label) => setState({ ...state, label })}
        isPending={props.isPending || state.label.trim().length === 0}
        placeholder={t('detail.add.placeholder')}
        submitText={t('detail.add.submit')}
      />
      {expanded ? (
        <ExpandedFields
          state={state}
          setState={setState}
          onCollapse={() => setExpanded(false)}
          t={t}
        />
      ) : (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-xs text-muted-foreground hover:underline"
        >
          {t('detail.add.showOptional')}
        </button>
      )}
    </form>
  );
}

function LabelRow({
  label,
  onChange,
  isPending,
  placeholder,
  submitText,
}: {
  label: string;
  onChange: (value: string) => void;
  isPending: boolean;
  placeholder: string;
  submitText: string;
}) {
  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={label}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {submitText}
      </button>
    </div>
  );
}

function ExpandedFields({
  state,
  setState,
  onCollapse,
  t,
}: {
  state: FormState;
  setState: (next: FormState) => void;
  onCollapse: () => void;
  t: (key: string) => string;
}) {
  return (
    <div className="flex gap-2">
      <input
        type="number"
        inputMode="decimal"
        step="any"
        value={state.qty}
        onChange={(e) => setState({ ...state, qty: e.target.value })}
        placeholder={t('detail.add.qty')}
        aria-label={t('detail.add.qty')}
        className="w-24 rounded-md border bg-background px-2 py-1 text-sm"
      />
      <input
        type="text"
        value={state.unit}
        onChange={(e) => setState({ ...state, unit: e.target.value })}
        placeholder={t('detail.add.unit')}
        aria-label={t('detail.add.unit')}
        className="w-28 rounded-md border bg-background px-2 py-1 text-sm"
      />
      <button
        type="button"
        onClick={onCollapse}
        className="text-xs text-muted-foreground hover:underline"
      >
        {t('detail.add.hideOptional')}
      </button>
    </div>
  );
}
