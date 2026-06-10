import { Label } from '@pops/ui';

/**
 * Small form controls shared by the fridge modals — keeps the modal
 * bodies under the lint-enforced `max-lines-per-function` budget.
 */
import type { ReactElement, ReactNode } from 'react';

export function FieldRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}): ReactElement {
  return (
    <Label className="block space-y-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </Label>
  );
}

export interface RadioOption {
  value: string;
  label: string;
}

interface RadioRowProps {
  name: string;
  value: string;
  options: readonly RadioOption[];
  onChange: (value: string) => void;
}

export function RadioRow({ name, value, options, onChange }: RadioRowProps): ReactElement {
  return (
    <div className="flex flex-wrap gap-3 text-sm">
      {options.map((o) => (
        <label key={o.value} className="flex items-center gap-1">
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

export function FormError({ message }: { message: string | null }): ReactElement | null {
  if (message === null) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

export function toIsoFromDateInput(yyyyMmDd: string): string | undefined {
  if (yyyyMmDd.length === 0) return undefined;
  const d = new Date(`${yyyyMmDd}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}
