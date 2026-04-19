import { trpc } from '@/lib/trpc';
import { CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Badge, Button, Input, Label, Select, Skeleton, Switch, Textarea, cn } from '@pops/ui';

import type { SettingsField, SettingsGroup, SettingsManifest } from '@pops/types';

type TestState = 'idle' | 'loading' | 'success' | 'error';
type SaveState = 'idle' | 'saving' | 'saved';

interface FieldProps {
  field: SettingsField;
  value: string;
  onChange: (key: string, value: string) => void;
  onTestAction: (procedure: string) => Promise<void>;
  envFallbackActive: boolean;
  saveState: SaveState;
  isOptionsLoading?: boolean;
}

function FieldWrapper({
  field,
  children,
  saveState,
}: {
  field: SettingsField;
  children: React.ReactNode;
  saveState?: SaveState;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Label className="text-sm text-muted-foreground">{field.label}</Label>
        {field.requiresRestart && (
          <Badge variant="outline" className="text-amber-500 border-amber-500 text-xs px-1.5 py-0">
            Requires restart
          </Badge>
        )}
        {saveState === 'saving' && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        )}
        {saveState === 'saved' && <CheckCircle2 className="h-3 w-3 text-green-500" />}
      </div>
      {children}
      {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}
    </div>
  );
}

const UNIT_MULTIPLIERS: Record<string, number> = {
  milliseconds: 1,
  seconds: 1_000,
  minutes: 60_000,
  hours: 3_600_000,
};

function inferUnit(ms: number): string {
  if (ms >= 3_600_000) return 'hours';
  if (ms >= 60_000) return 'minutes';
  if (ms >= 1_000) return 'seconds';
  return 'milliseconds';
}

function DurationFieldInput({
  field,
  value,
  onChange,
  saveState,
}: {
  field: SettingsField;
  value: string;
  onChange: (key: string, value: string) => void;
  saveState: SaveState;
}) {
  const ms = value ? parseInt(value, 10) : 0;
  const [unit, setUnit] = useState(() => inferUnit(ms));

  const displayValue = ms ? String(ms / (UNIT_MULTIPLIERS[unit] ?? 1)) : '';

  return (
    <FieldWrapper field={field} saveState={saveState}>
      <div className="flex gap-2">
        <Input
          type="number"
          value={displayValue}
          min={0}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') {
              onChange(field.key, '');
            } else {
              const n = parseFloat(raw);
              if (!isNaN(n))
                onChange(field.key, String(Math.round(n * (UNIT_MULTIPLIERS[unit] ?? 1))));
            }
          }}
          className="w-32"
        />
        <Select
          options={[
            { value: 'milliseconds', label: 'ms' },
            { value: 'seconds', label: 'seconds' },
            { value: 'minutes', label: 'minutes' },
            { value: 'hours', label: 'hours' },
          ]}
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
        />
      </div>
    </FieldWrapper>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  onTestAction,
  envFallbackActive,
  saveState,
  isOptionsLoading,
}: FieldProps) {
  const [revealed, setRevealed] = useState(false);
  const [testState, setTestState] = useState<TestState>('idle');
  const [testError, setTestError] = useState<string>('');
  const [validationError, setValidationError] = useState<string>('');
  const [jsonError, setJsonError] = useState<string>('');

  const validate = useCallback(
    (val: string): boolean => {
      const v = field.validation;
      if (!v) return true;
      if (v.required && !val.trim()) {
        setValidationError(v.message ?? `${field.label} is required`);
        return false;
      }
      if (field.type === 'number') {
        const n = Number(val);
        if (val !== '' && isNaN(n)) {
          setValidationError(v.message ?? 'Must be a number');
          return false;
        }
        if (val !== '' && v.min !== undefined && n < v.min) {
          setValidationError(v.message ?? `Must be at least ${v.min}`);
          return false;
        }
        if (val !== '' && v.max !== undefined && n > v.max) {
          setValidationError(v.message ?? `Must be at most ${v.max}`);
          return false;
        }
      }
      if (v.pattern && val && !new RegExp(v.pattern).test(val)) {
        setValidationError(v.message ?? 'Invalid format');
        return false;
      }
      setValidationError('');
      return true;
    },
    [field]
  );

  const handleChange = (newVal: string) => {
    const valid = validate(newVal);
    if (!valid) return;
    onChange(field.key, newVal);
  };

  const handleTest = async () => {
    if (!field.testAction) return;
    setTestState('loading');
    setTestError('');
    try {
      await onTestAction(field.testAction.procedure);
      setTestState('success');
      setTimeout(() => setTestState('idle'), 3000);
    } catch (err) {
      setTestState('error');
      setTestError(err instanceof Error ? err.message : 'Test failed');
    }
  };

  const envLabel =
    envFallbackActive && field.envFallback ? (
      <p className="text-xs text-muted-foreground">
        Using environment variable {field.envFallback}
      </p>
    ) : null;

  if (field.type === 'duration') {
    return (
      <DurationFieldInput field={field} value={value} onChange={onChange} saveState={saveState} />
    );
  }

  if (field.type === 'toggle') {
    return (
      <FieldWrapper field={field} saveState={saveState}>
        <Switch
          checked={value === 'true'}
          onCheckedChange={(checked) => handleChange(checked ? 'true' : 'false')}
        />
        {envLabel}
      </FieldWrapper>
    );
  }

  if (field.type === 'select') {
    return (
      <FieldWrapper field={field} saveState={saveState}>
        {isOptionsLoading ? (
          <Select disabled options={[]} placeholder="Loading options…" value="" />
        ) : (
          <Select
            options={field.options ?? []}
            value={value}
            onChange={(e) => handleChange(e.target.value)}
          />
        )}
        {envLabel}
      </FieldWrapper>
    );
  }

  if (field.type === 'json') {
    return (
      <FieldWrapper field={field} saveState={saveState}>
        <Textarea
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={(e) => {
            try {
              if (e.target.value) JSON.parse(e.target.value);
              setJsonError('');
            } catch {
              setJsonError('Invalid JSON');
            }
          }}
          rows={4}
          className="font-mono text-sm"
        />
        {jsonError && <p className="text-xs text-destructive">{jsonError}</p>}
        {envLabel}
      </FieldWrapper>
    );
  }

  if (field.type === 'password') {
    return (
      <FieldWrapper field={field} saveState={saveState}>
        <div className="flex gap-2">
          <Input
            type={revealed ? 'text' : 'password'}
            value={value}
            placeholder={envFallbackActive ? '(from environment)' : '••••••••'}
            onChange={(e) => handleChange(e.target.value)}
            className="flex-1"
          />
          <Button variant="outline" size="sm" onClick={() => setRevealed((r) => !r)} type="button">
            {revealed ? 'Hide' : 'Reveal'}
          </Button>
          {field.testAction && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={testState === 'loading'}
              type="button"
            >
              {testState === 'loading' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : testState === 'success' ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              ) : testState === 'error' ? (
                <XCircle className="h-3.5 w-3.5 text-destructive" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              <span className="ml-1">{field.testAction.label}</span>
            </Button>
          )}
        </div>
        {testState === 'error' && testError && (
          <p className="text-xs text-destructive">{testError}</p>
        )}
        {validationError && <p className="text-xs text-destructive">{validationError}</p>}
        {envLabel}
      </FieldWrapper>
    );
  }

  // text, number, url
  const inputType = field.type === 'number' ? 'number' : field.type === 'url' ? 'url' : 'text';

  return (
    <FieldWrapper field={field} saveState={saveState}>
      <div className="flex gap-2">
        <Input
          type={inputType}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          min={field.type === 'number' ? field.validation?.min : undefined}
          max={field.type === 'number' ? field.validation?.max : undefined}
          className="flex-1"
        />
        {field.testAction && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleTest}
            disabled={testState === 'loading'}
            type="button"
          >
            {testState === 'loading' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : testState === 'success' ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            ) : testState === 'error' ? (
              <XCircle className="h-3.5 w-3.5 text-destructive" />
            ) : null}
            <span className={cn(testState !== 'idle' && 'ml-1')}>{field.testAction.label}</span>
          </Button>
        )}
      </div>
      {testState === 'error' && testError && (
        <p className="text-xs text-destructive">{testError}</p>
      )}
      {validationError && <p className="text-xs text-destructive">{validationError}</p>}
      {envLabel}
    </FieldWrapper>
  );
}

interface GroupRendererProps {
  group: SettingsGroup;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onTestAction: (procedure: string) => Promise<void>;
  dbValues: Record<string, string>;
  saveStates: Record<string, SaveState>;
  loadingOptionKeys: Set<string>;
}

function GroupRenderer({
  group,
  values,
  onChange,
  onTestAction,
  dbValues,
  saveStates,
  loadingOptionKeys,
}: GroupRendererProps) {
  return (
    <div className="rounded-lg border bg-card p-5 space-y-4">
      <div>
        <h3 className="font-medium text-sm">{group.title}</h3>
        {group.description && (
          <p className="text-xs text-muted-foreground mt-0.5">{group.description}</p>
        )}
      </div>
      <div className="space-y-4">
        {group.fields.map((field) => (
          <FieldInput
            key={field.key}
            field={field}
            value={values[field.key] ?? field.default ?? ''}
            onChange={onChange}
            onTestAction={onTestAction}
            envFallbackActive={!!field.envFallback && !(field.key in dbValues)}
            saveState={saveStates[field.key] ?? 'idle'}
            isOptionsLoading={loadingOptionKeys.has(field.key)}
          />
        ))}
      </div>
    </div>
  );
}

interface SectionRendererProps {
  manifest: SettingsManifest;
  optionsLoaders?: Record<string, () => Promise<{ value: string; label: string }[]>>;
  onTestAction?: (procedure: string) => Promise<void>;
}

export function SectionRenderer({ manifest, optionsLoaders, onTestAction }: SectionRendererProps) {
  const allKeys = manifest.groups.flatMap((g) => g.fields.map((f) => f.key));

  const { data, isLoading } = trpc.core.settings.getBulk.useQuery({ keys: allKeys });
  const setBulkMutation = trpc.core.settings.setBulk.useMutation();

  const [values, setValues] = useState<Record<string, string>>({});
  const [loadedKeys, setLoadedKeys] = useState<Record<string, string>>({});
  const [dynamicOptions, setDynamicOptions] = useState<
    Record<string, { value: string; label: string }[]>
  >({});
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [loadingOptionKeys, setLoadingOptionKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!data?.settings) return;
    setLoadedKeys(data.settings);
    const withDefaults: Record<string, string> = { ...data.settings };
    for (const group of manifest.groups) {
      for (const field of group.fields) {
        if (!(field.key in withDefaults) && field.default !== undefined) {
          withDefaults[field.key] = field.default;
        }
      }
    }
    setValues(withDefaults);
  }, [data?.settings, manifest]);

  useEffect(() => {
    if (!optionsLoaders) return;
    let cancelled = false;
    const keysStarted = new Set<string>();
    for (const [key, loader] of Object.entries(optionsLoaders)) {
      keysStarted.add(key);
      setLoadingOptionKeys((prev) => new Set([...prev, key]));
      Promise.resolve()
        .then(loader)
        .then((opts) => {
          if (!cancelled) setDynamicOptions((prev) => ({ ...prev, [key]: opts }));
        })
        .catch(() => {
          /* fall back to static options */
        })
        .finally(() => {
          if (!cancelled)
            setLoadingOptionKeys((prev) => {
              const next = new Set(prev);
              next.delete(key);
              return next;
            });
        });
    }
    return () => {
      cancelled = true;
      setLoadingOptionKeys((prev) => {
        const next = new Set(prev);
        for (const key of keysStarted) next.delete(key);
        return next;
      });
    };
  }, [optionsLoaders]);

  const debounceRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const savedTimerRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const saveVersionRefs = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    return () => {
      for (const timer of debounceRefs.current.values()) clearTimeout(timer);
      for (const timer of savedTimerRefs.current.values()) clearTimeout(timer);
    };
  }, []);

  const handleChange = useCallback(
    (key: string, value: string) => {
      setValues((prev) => ({ ...prev, [key]: value }));

      // Clear any pending saved→idle timer and immediately hide stale checkmark
      const pendingSaved = savedTimerRefs.current.get(key);
      if (pendingSaved) {
        clearTimeout(pendingSaved);
        savedTimerRefs.current.delete(key);
      }
      setSaveStates((prev) => ({ ...prev, [key]: 'idle' }));

      const existing = debounceRefs.current.get(key);
      if (existing) clearTimeout(existing);

      const timer = setTimeout(() => {
        debounceRefs.current.delete(key);
        const version = (saveVersionRefs.current.get(key) ?? 0) + 1;
        saveVersionRefs.current.set(key, version);
        setSaveStates((prev) => ({ ...prev, [key]: 'saving' }));
        setBulkMutation.mutate(
          { entries: [{ key, value }] },
          {
            onSuccess: () => {
              if (saveVersionRefs.current.get(key) !== version) return;
              const prevSaved = savedTimerRefs.current.get(key);
              if (prevSaved) {
                clearTimeout(prevSaved);
                savedTimerRefs.current.delete(key);
              }
              setSaveStates((prev) => ({ ...prev, [key]: 'saved' }));
              const savedTimer = setTimeout(() => {
                savedTimerRefs.current.delete(key);
                setSaveStates((prev) =>
                  prev[key] === 'saved' ? { ...prev, [key]: 'idle' } : prev
                );
              }, 2000);
              savedTimerRefs.current.set(key, savedTimer);
            },
            onError: (err) => {
              if (saveVersionRefs.current.get(key) !== version) return;
              setSaveStates((prev) => ({ ...prev, [key]: 'idle' }));
              toast.error(`Failed to save ${key}: ${err.message}`);
            },
          }
        );
      }, 500);

      debounceRefs.current.set(key, timer);
    },
    [setBulkMutation]
  );

  const handleTestAction = useCallback(
    async (procedure: string) => {
      if (onTestAction) {
        await onTestAction(procedure);
        return;
      }
      throw new Error(`No handler for procedure: ${procedure}`);
    },
    [onTestAction]
  );

  const manifestWithDynamicOptions: SettingsManifest = {
    ...manifest,
    groups: manifest.groups.map((group) => ({
      ...group,
      fields: group.fields.map((field) => ({
        ...field,
        options: dynamicOptions[field.key] ?? field.options,
      })),
    })),
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {manifestWithDynamicOptions.groups.map((group) => (
        <GroupRenderer
          key={group.id}
          group={group}
          values={values}
          onChange={handleChange}
          onTestAction={handleTestAction}
          dbValues={loadedKeys}
          saveStates={saveStates}
          loadingOptionKeys={loadingOptionKeys}
        />
      ))}
    </div>
  );
}
