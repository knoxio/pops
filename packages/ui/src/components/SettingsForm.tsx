/**
 * SettingsForm — renders a declarative settings manifest (text, number,
 * toggle, select, password, json, duration, textarea) with validation,
 * async option loaders, auto-save, and test actions.
 *
 * Generic over a values record. The manifest is data-driven so any app
 * can register its own settings section and mount the renderer. Each
 * field's value is stored under its `id` in the returned values object.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '../lib/utils';
import { Checkbox } from '../primitives/checkbox';
import { Input } from '../primitives/input';
import { Label } from '../primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../primitives/select';
import { Textarea } from '../primitives/textarea';
import { Button } from './Button';
import { DurationFieldInput } from './DurationFieldInput';

export type SettingsFieldKind =
  | 'text'
  | 'number'
  | 'toggle'
  | 'select'
  | 'password'
  | 'json'
  | 'duration'
  | 'textarea';

export interface SettingsOption {
  value: string;
  label: string;
}

export interface SettingsField {
  id: string;
  kind: SettingsFieldKind;
  label: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  /** Static options for `select`. */
  options?: SettingsOption[];
  /** Async loader for `select` options. */
  loadOptions?: () => Promise<SettingsOption[]>;
  /** Custom validator. Return error string or null. */
  validate?: (value: unknown, values: Record<string, unknown>) => string | null;
  /** For `number`, optional min/max. */
  min?: number;
  max?: number;
  /** For `duration`: canonical value is ms. */
  defaultValue?: unknown;
  /** Environment fallback label when set externally. */
  envFallbackLabel?: string;
}

export interface SettingsTestAction {
  id: string;
  label: string;
  run: (values: Record<string, unknown>) => Promise<{ ok: boolean; message?: string }>;
}

export interface SettingsSection {
  id: string;
  title: string;
  description?: string;
  fields: SettingsField[];
  testActions?: SettingsTestAction[];
}

export interface SettingsFormProps {
  section: SettingsSection;
  values: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  /** Called when the form is committed. Omit for auto-save on change. */
  onSave?: (values: Record<string, unknown>) => Promise<void> | void;
  /** If true and `onSave` is set, save on field change instead of via button. */
  autoSave?: boolean;
  /** Extra read-only badges shown in the header. */
  headerSlot?: React.ReactNode;
  className?: string;
}

export function SettingsForm({
  section,
  values,
  onChange,
  onSave,
  autoSave = false,
  headerSlot,
  className,
}: SettingsFormProps) {
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [loadedOptions, setLoadedOptions] = useState<Record<string, SettingsOption[]>>({});
  const [saving, setSaving] = useState(false);
  const [testStatus, setTestStatus] = useState<Record<string, { ok: boolean; message?: string }>>(
    {}
  );
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    for (const field of section.fields) {
      if (field.kind === 'select' && field.loadOptions && !loadedOptions[field.id]) {
        field
          .loadOptions()
          .then((opts) => setLoadedOptions((s) => ({ ...s, [field.id]: opts })))
          .catch(() => setLoadedOptions((s) => ({ ...s, [field.id]: [] })));
      }
    }
  }, [section.fields, loadedOptions]);

  const runValidation = useCallback(
    (next: Record<string, unknown>): boolean => {
      const errs: Record<string, string | null> = {};
      let hasError = false;
      for (const field of section.fields) {
        const v = next[field.id];
        let err: string | null = null;
        if (field.required && (v === undefined || v === null || v === '')) {
          err = `${field.label} is required`;
        } else if (field.kind === 'json' && typeof v === 'string' && v.trim()) {
          try {
            JSON.parse(v);
          } catch {
            err = 'Invalid JSON';
          }
        }
        if (!err && field.validate) err = field.validate(v, next);
        if (err) hasError = true;
        errs[field.id] = err;
      }
      setErrors(errs);
      return !hasError;
    },
    [section.fields]
  );

  const update = useCallback(
    (id: string, value: unknown) => {
      const next = { ...values, [id]: value };
      onChange(next);
      const valid = runValidation(next);
      if (autoSave && onSave && valid) {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(async () => {
          setSaving(true);
          try {
            await onSave(next);
          } finally {
            setSaving(false);
          }
        }, 400);
      }
    },
    [values, onChange, runValidation, autoSave, onSave]
  );

  const handleCommit = async () => {
    if (!onSave) return;
    if (!runValidation(values)) return;
    setSaving(true);
    try {
      await onSave(values);
    } finally {
      setSaving(false);
    }
  };

  const renderControl = (
    field: SettingsField,
    value: unknown,
    fieldId: string,
    error: string | null | undefined
  ): React.ReactNode => {
    const common = { id: fieldId, disabled: saving, 'aria-invalid': !!error || undefined };
    switch (field.kind) {
      case 'text':
      case 'password':
        return (
          <Input
            {...common}
            type={field.kind === 'password' ? 'password' : 'text'}
            value={typeof value === 'string' ? value : ''}
            placeholder={field.placeholder}
            onChange={(e) => update(field.id, e.target.value)}
          />
        );
      case 'number':
        return (
          <Input
            {...common}
            type="number"
            min={field.min}
            max={field.max}
            value={typeof value === 'number' ? value : value === '' ? '' : Number(value) || 0}
            placeholder={field.placeholder}
            onChange={(e) => update(field.id, e.target.value === '' ? '' : Number(e.target.value))}
          />
        );
      case 'toggle':
        return (
          <Checkbox
            id={fieldId}
            disabled={saving}
            checked={!!value}
            onCheckedChange={(v) => update(field.id, v === true)}
          />
        );
      case 'select': {
        const opts = field.options ?? loadedOptions[field.id] ?? [];
        return (
          <Select
            value={typeof value === 'string' ? value : ''}
            onValueChange={(v) => update(field.id, v)}
            disabled={saving}
          >
            <SelectTrigger id={fieldId}>
              <SelectValue placeholder={field.placeholder} />
            </SelectTrigger>
            <SelectContent>
              {opts.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      }
      case 'textarea':
      case 'json':
        return (
          <Textarea
            {...common}
            rows={field.kind === 'json' ? 6 : 3}
            value={typeof value === 'string' ? value : ''}
            placeholder={field.placeholder}
            onChange={(e) => update(field.id, e.target.value)}
          />
        );
      case 'duration':
        return (
          <DurationFieldInput
            id={fieldId}
            disabled={saving}
            value={typeof value === 'number' ? value : 0}
            onChange={(next) => update(field.id, next)}
          />
        );
      default:
        return null;
    }
  };

  const renderField = (field: SettingsField) => {
    const value = values[field.id] ?? field.defaultValue ?? '';
    const error = errors[field.id];
    const fieldId = `settings-${section.id}-${field.id}`;

    return (
      <div key={field.id} className="flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <Label htmlFor={fieldId}>
              {field.label}
              {field.required ? <span className="text-destructive"> *</span> : null}
            </Label>
            {field.description ? (
              <div className="text-xs text-muted-foreground">{field.description}</div>
            ) : null}
          </div>
          {field.envFallbackLabel ? (
            <span className="text-xs text-muted-foreground">{field.envFallbackLabel}</span>
          ) : null}
        </div>
        <div>{renderControl(field, value, fieldId, error)}</div>
        {error ? <div className="text-xs text-destructive">{error}</div> : null}
      </div>
    );
  };

  const testActions = section.testActions ?? [];

  const handleRunTest = async (action: SettingsTestAction) => {
    const result = await action.run(values);
    setTestStatus((s) => ({ ...s, [action.id]: result }));
  };

  const showFooter = useMemo(() => !autoSave && typeof onSave === 'function', [autoSave, onSave]);

  return (
    <section className={cn('flex flex-col gap-5', className)}>
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{section.title}</h2>
          {section.description ? (
            <p className="text-sm text-muted-foreground">{section.description}</p>
          ) : null}
        </div>
        {headerSlot}
      </header>
      <div className="flex flex-col gap-4">{section.fields.map(renderField)}</div>
      {testActions.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/20 p-3">
          <div className="text-sm font-medium">Test actions</div>
          <div className="flex flex-wrap gap-2">
            {testActions.map((action) => {
              const status = testStatus[action.id];
              return (
                <div key={action.id} className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleRunTest(action)}>
                    {action.label}
                  </Button>
                  {status ? (
                    <span
                      className={cn('text-xs', status.ok ? 'text-success' : 'text-destructive')}
                    >
                      {status.message ?? (status.ok ? 'OK' : 'Failed')}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
      {showFooter ? (
        <footer className="flex justify-end gap-2">
          <Button onClick={handleCommit} loading={saving}>
            Save
          </Button>
        </footer>
      ) : null}
    </section>
  );
}

export { SettingsForm as SectionRenderer };
