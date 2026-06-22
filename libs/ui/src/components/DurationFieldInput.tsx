/**
 * DurationFieldInput — number input + unit selector (ms/seconds/minutes/hours)
 * with conversion logic. Stores the canonical value in milliseconds and
 * renders a user-friendly unit.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import { cn } from '../lib/utils';
import { Input } from '../primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../primitives/select';

export type DurationUnit = 'ms' | 'seconds' | 'minutes' | 'hours';

export const UNIT_MULTIPLIERS: Record<DurationUnit, number> = {
  ms: 1,
  seconds: 1000,
  minutes: 60_000,
  hours: 3_600_000,
};

export function inferUnit(ms: number): DurationUnit {
  if (ms === 0) return 'seconds';
  if (ms % UNIT_MULTIPLIERS.hours === 0) return 'hours';
  if (ms % UNIT_MULTIPLIERS.minutes === 0) return 'minutes';
  if (ms % UNIT_MULTIPLIERS.seconds === 0) return 'seconds';
  return 'ms';
}

export interface DurationFieldInputProps {
  /** Current value in milliseconds. */
  value: number;
  onChange: (nextMs: number) => void;
  /** Which units the user can pick. Defaults to all four. */
  units?: DurationUnit[];
  /** Override the initial display unit. */
  defaultUnit?: DurationUnit;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
  'aria-label'?: string;
}

const UNIT_LABELS: Record<DurationUnit, string> = {
  ms: 'ms',
  seconds: 'seconds',
  minutes: 'minutes',
  hours: 'hours',
};

function useDurationUnit(value: number, units: DurationUnit[], defaultUnit?: DurationUnit) {
  const clampUnit = useCallback(
    (u: DurationUnit): DurationUnit => (units.includes(u) ? u : (units[0] ?? 'ms')),
    [units]
  );
  const [unit, setUnit] = useState<DurationUnit>(() => clampUnit(defaultUnit ?? inferUnit(value)));

  useEffect(() => {
    if (value === 0) return;
    const multiplier = UNIT_MULTIPLIERS[unit];
    if (value % multiplier !== 0) setUnit(clampUnit(inferUnit(value)));
  }, [value, unit, clampUnit]);

  useEffect(() => {
    if (!units.includes(unit)) setUnit(clampUnit(unit));
  }, [units, unit, clampUnit]);

  return [unit, setUnit] as const;
}

export function DurationFieldInput({
  value,
  onChange,
  units = ['ms', 'seconds', 'minutes', 'hours'],
  defaultUnit,
  disabled,
  placeholder,
  className,
  id,
  'aria-label': ariaLabel,
}: DurationFieldInputProps) {
  const [unit, setUnit] = useDurationUnit(value, units, defaultUnit);
  const displayValue = useMemo(() => {
    if (value === 0) return '';
    return String(value / UNIT_MULTIPLIERS[unit]);
  }, [value, unit]);

  const handleNumberChange = (raw: string) => {
    if (raw === '') {
      onChange(0);
      return;
    }
    const num = Number(raw);
    if (!Number.isFinite(num) || num < 0) return;
    onChange(Math.round(num * UNIT_MULTIPLIERS[unit]));
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Input
        id={id}
        type="number"
        min={0}
        step="any"
        inputMode="decimal"
        disabled={disabled}
        value={displayValue}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => handleNumberChange(e.target.value)}
        className="w-32"
      />
      <Select value={unit} onValueChange={(v) => setUnit(v as DurationUnit)} disabled={disabled}>
        <SelectTrigger className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {units.map((u) => (
            <SelectItem key={u} value={u}>
              {UNIT_LABELS[u]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
