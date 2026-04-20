import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  SettingsField,
  SettingsOption,
  SettingsSection,
  SettingsTestAction,
} from './SettingsForm.types';

function validateField(
  field: SettingsField,
  v: unknown,
  values: Record<string, unknown>
): string | null {
  if (field.required && (v === undefined || v === null || v === '')) {
    return `${field.label} is required`;
  }
  if (field.kind === 'json' && typeof v === 'string' && v.trim()) {
    try {
      JSON.parse(v);
    } catch {
      return 'Invalid JSON';
    }
  }
  if (field.validate) return field.validate(v, values);
  return null;
}

export function useSettingsErrors(fields: SettingsField[]) {
  const [errors, setErrors] = useState<Record<string, string | null>>({});

  const runValidation = useCallback(
    (next: Record<string, unknown>): boolean => {
      const errs: Record<string, string | null> = {};
      let hasError = false;
      for (const field of fields) {
        const err = validateField(field, next[field.id], next);
        if (err) hasError = true;
        errs[field.id] = err;
      }
      setErrors(errs);
      return !hasError;
    },
    [fields]
  );

  return { errors, runValidation };
}

export function useLoadedOptions(fields: SettingsField[]) {
  const [loadedOptions, setLoadedOptions] = useState<Record<string, SettingsOption[]>>({});

  useEffect(() => {
    for (const field of fields) {
      if (field.kind === 'select' && field.loadOptions && !loadedOptions[field.id]) {
        field
          .loadOptions()
          .then((opts) => setLoadedOptions((s) => ({ ...s, [field.id]: opts })))
          .catch(() => setLoadedOptions((s) => ({ ...s, [field.id]: [] })));
      }
    }
  }, [fields, loadedOptions]);

  return loadedOptions;
}

export interface UseSettingsSaveArgs {
  values: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  onSave?: (values: Record<string, unknown>) => Promise<void> | void;
  autoSave: boolean;
  runValidation: (next: Record<string, unknown>) => boolean;
}

export function useSettingsSave({
  values,
  onChange,
  onSave,
  autoSave,
  runValidation,
}: UseSettingsSaveArgs) {
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
  }, [onSave, autoSave]);

  const update = useCallback(
    (id: string, value: unknown) => {
      const next = { ...values, [id]: value };
      onChange(next);
      const valid = runValidation(next);
      if (autoSave && onSave && valid) {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(async () => {
          if (!mountedRef.current) return;
          setSaving(true);
          try {
            await onSave(next);
          } finally {
            if (mountedRef.current) setSaving(false);
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

  return { saving, update, handleCommit };
}

export function useTestActions(section: SettingsSection, values: Record<string, unknown>) {
  const [testStatus, setTestStatus] = useState<Record<string, { ok: boolean; message?: string }>>(
    {}
  );

  const handleRunTest = async (action: SettingsTestAction) => {
    const result = await action.run(values);
    setTestStatus((s) => ({ ...s, [action.id]: result }));
  };

  return { testStatus, handleRunTest, testActions: section.testActions ?? [] };
}
