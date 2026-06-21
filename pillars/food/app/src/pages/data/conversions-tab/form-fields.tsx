/**
 * Form-row helpers used by the create/edit dialogs in this tab.
 *
 * Kept local (rather than reusing the ingredients-tab variants) because
 * the conversions dialogs need a NumberFieldRow + an optional TextareaRow,
 * which the ingredient helpers don't expose. Each row is one labelled
 * control so the parent dialogs stay declarative.
 */
import { useTranslation } from 'react-i18next';

import { Label, Textarea, TextInput } from '@pops/ui';

export function TextFieldRow({
  id,
  labelKey,
  value,
  placeholder,
  required,
  autoFocus,
  onChange,
}: {
  id: string;
  labelKey: string;
  value: string;
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
  onChange: (next: string) => void;
}) {
  const { t } = useTranslation('food');
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{t(labelKey)}</Label>
      <TextInput
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        autoFocus={autoFocus}
      />
    </div>
  );
}

export function NumberFieldRow({
  id,
  labelKey,
  value,
  step,
  placeholder,
  autoFocus,
  onChange,
}: {
  id: string;
  labelKey: string;
  value: string;
  step?: string;
  placeholder?: string;
  autoFocus?: boolean;
  onChange: (next: string) => void;
}) {
  const { t } = useTranslation('food');
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{t(labelKey)}</Label>
      <TextInput
        id={id}
        type="number"
        inputMode="decimal"
        step={step ?? 'any'}
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required
        autoFocus={autoFocus}
      />
    </div>
  );
}

export function SelectFieldRow({
  id,
  labelKey,
  value,
  options,
  onChange,
}: {
  id: string;
  labelKey: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (next: string) => void;
}) {
  const { t } = useTranslation('food');
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{t(labelKey)}</Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-input bg-background h-9 rounded-md border px-3 text-sm"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function TextareaFieldRow({
  id,
  labelKey,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  labelKey: string;
  value: string;
  placeholder?: string;
  onChange: (next: string) => void;
}) {
  const { t } = useTranslation('food');
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{t(labelKey)}</Label>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={2}
      />
    </div>
  );
}
