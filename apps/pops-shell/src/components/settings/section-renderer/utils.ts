import type { SettingsField } from '@pops/types';

export const UNIT_MULTIPLIERS: Record<string, number> = {
  milliseconds: 1,
  seconds: 1_000,
  minutes: 60_000,
  hours: 3_600_000,
};

export function inferUnit(ms: number): string {
  if (ms >= 3_600_000) return 'hours';
  if (ms >= 60_000) return 'minutes';
  if (ms >= 1_000) return 'seconds';
  return 'milliseconds';
}

export function getInputType(type: SettingsField['type']): 'number' | 'url' | 'text' {
  if (type === 'number') return 'number';
  if (type === 'url') return 'url';
  return 'text';
}

interface ValidateNumberArgs {
  val: string;
  v: NonNullable<SettingsField['validation']>;
  fallbackMsg: string;
}

export function validateNumberRange({ val, v, fallbackMsg }: ValidateNumberArgs): string | null {
  const n = Number(val);
  if (val !== '' && isNaN(n)) return v.message ?? fallbackMsg;
  if (val !== '' && v.min !== undefined && n < v.min)
    return v.message ?? `Must be at least ${v.min}`;
  if (val !== '' && v.max !== undefined && n > v.max)
    return v.message ?? `Must be at most ${v.max}`;
  return null;
}

export function validateField(field: SettingsField, val: string): string {
  const v = field.validation;
  if (!v) return '';
  if (v.required && !val.trim()) return v.message ?? `${field.label} is required`;
  if (field.type === 'number') {
    const numErr = validateNumberRange({ val, v, fallbackMsg: 'Must be a number' });
    if (numErr) return numErr;
  }
  if (v.pattern && val && !new RegExp(v.pattern).test(val)) {
    return v.message ?? 'Invalid format';
  }
  return '';
}
