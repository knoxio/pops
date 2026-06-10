import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { SHOPPING_UNIT_SUGGESTIONS } from './unit-suggestions.js';

/**
 * Shopping add form (PRD-141 §ShoppingAddForm).
 *
 * Differences vs the generic `ListItemAddForm`:
 *   - `[qty] [unit] [label]` ordering (qty first — most common
 *     starting point).
 *   - Unit field is backed by a `<datalist>` of common units so the
 *     mobile keyboard surfaces suggestions; free-text entry still works.
 *   - On submit, focus returns to the qty field for fast multi-item
 *     entry.
 */
export interface ShoppingAddFormProps {
  isPending: boolean;
  onAdd: (input: { label: string; qty: number | null; unit: string | null }) => Promise<boolean>;
}

interface FormState {
  qty: string;
  unit: string;
  label: string;
}

const EMPTY_FORM: FormState = { qty: '', unit: '', label: '' };

function parseForm(
  state: FormState
): { qty: number | null; unit: string | null; label: string } | null {
  const label = state.label.trim();
  if (label.length === 0) return null;
  const qty = state.qty.trim().length === 0 ? null : Number(state.qty);
  if (qty !== null && !Number.isFinite(qty)) return null;
  const unit = state.unit.trim().length === 0 ? null : state.unit.trim();
  return { qty, unit, label };
}

function useShoppingAddState(onAdd: ShoppingAddFormProps['onAdd']) {
  const [state, setState] = useState<FormState>(EMPTY_FORM);
  const qtyRef = useRef<HTMLInputElement>(null);
  const submit = async () => {
    const parsed = parseForm(state);
    if (parsed === null) return;
    const ok = await onAdd(parsed);
    if (ok) {
      setState(EMPTY_FORM);
      qtyRef.current?.focus();
    }
  };
  return { state, setState, qtyRef, submit };
}

export function ShoppingAddForm(props: ShoppingAddFormProps): React.ReactElement {
  const { t } = useTranslation('lists');
  const { state, setState, qtyRef, submit } = useShoppingAddState(props.onAdd);
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit();
  };
  const disabled = props.isPending || state.label.trim().length === 0;
  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-3"
    >
      <QtyUnitInputs state={state} setState={setState} qtyRef={qtyRef} t={t} />
      <LabelSubmit state={state} setState={setState} disabled={disabled} t={t} />
    </form>
  );
}

function QtyUnitInputs({
  state,
  setState,
  qtyRef,
  t,
}: {
  state: FormState;
  setState: (next: FormState) => void;
  qtyRef: React.RefObject<HTMLInputElement | null>;
  t: (key: string) => string;
}) {
  return (
    <>
      <input
        ref={qtyRef}
        type="number"
        inputMode="decimal"
        step="any"
        value={state.qty}
        onChange={(e) => setState({ ...state, qty: e.target.value })}
        placeholder={t('shopping.add.qty')}
        aria-label={t('shopping.add.qty')}
        className="w-20 rounded-md border bg-background px-2 py-2 text-sm"
      />
      <input
        type="text"
        list="shopping-unit-suggestions"
        value={state.unit}
        onChange={(e) => setState({ ...state, unit: e.target.value })}
        placeholder={t('shopping.add.unit')}
        aria-label={t('shopping.add.unit')}
        className="w-24 rounded-md border bg-background px-2 py-2 text-sm"
      />
      <datalist id="shopping-unit-suggestions">
        {SHOPPING_UNIT_SUGGESTIONS.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>
    </>
  );
}

function LabelSubmit({
  state,
  setState,
  disabled,
  t,
}: {
  state: FormState;
  setState: (next: FormState) => void;
  disabled: boolean;
  t: (key: string) => string;
}) {
  return (
    <>
      <input
        type="text"
        value={state.label}
        onChange={(e) => setState({ ...state, label: e.target.value })}
        placeholder={t('shopping.add.label')}
        aria-label={t('shopping.add.label')}
        className="min-w-32 flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <button
        type="submit"
        disabled={disabled}
        className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {t('shopping.add.submit')}
      </button>
    </>
  );
}
