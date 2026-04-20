/**
 * SettingsForm — renders a declarative settings manifest (text, number,
 * toggle, select, password, json, duration, textarea) with validation,
 * async option loaders, auto-save, and test actions.
 *
 * Generic over a values record. The manifest is data-driven so any app
 * can register its own settings section and mount the renderer. Each
 * field's value is stored under its `id` in the returned values object.
 */
import { useMemo } from 'react';

import { cn } from '../lib/utils';
import { Label } from '../primitives/label';
import { Button } from './Button';
import { FieldControl } from './SettingsForm.controls';
import {
  useLoadedOptions,
  useSettingsErrors,
  useSettingsSave,
  useTestActions,
} from './SettingsForm.hooks';

import type { SettingsField, SettingsSection, SettingsTestAction } from './SettingsForm.types';

export type {
  SettingsField,
  SettingsFieldKind,
  SettingsOption,
  SettingsSection,
  SettingsTestAction,
} from './SettingsForm.types';

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

interface SettingsFieldRowProps {
  field: SettingsField;
  sectionId: string;
  value: unknown;
  error: string | null | undefined;
  saving: boolean;
  loadedOptions: ReturnType<typeof useLoadedOptions>;
  update: (id: string, value: unknown) => void;
}

function SettingsFieldRow({
  field,
  sectionId,
  value,
  error,
  saving,
  loadedOptions,
  update,
}: SettingsFieldRowProps) {
  const fieldId = `settings-${sectionId}-${field.id}`;
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
      <div>
        <FieldControl
          field={field}
          value={value}
          fieldId={fieldId}
          error={error}
          saving={saving}
          loadedOptions={loadedOptions}
          update={update}
        />
      </div>
      {error ? <div className="text-xs text-destructive">{error}</div> : null}
    </div>
  );
}

interface TestActionsPanelProps {
  testActions: SettingsTestAction[];
  testStatus: Record<string, { ok: boolean; message?: string }>;
  onRun: (action: SettingsTestAction) => void;
}

function TestActionsPanel({ testActions, testStatus, onRun }: TestActionsPanelProps) {
  if (testActions.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/20 p-3">
      <div className="text-sm font-medium">Test actions</div>
      <div className="flex flex-wrap gap-2">
        {testActions.map((action) => {
          const status = testStatus[action.id];
          return (
            <div key={action.id} className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => onRun(action)}>
                {action.label}
              </Button>
              {status ? (
                <span className={cn('text-xs', status.ok ? 'text-success' : 'text-destructive')}>
                  {status.message ?? (status.ok ? 'OK' : 'Failed')}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  description,
  headerSlot,
}: {
  title: string;
  description?: string;
  headerSlot?: React.ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {headerSlot}
    </header>
  );
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
  const { errors, runValidation } = useSettingsErrors(section.fields);
  const loadedOptions = useLoadedOptions(section.fields);
  const { saving, update, handleCommit } = useSettingsSave({
    values,
    onChange,
    onSave,
    autoSave,
    runValidation,
  });
  const { testStatus, handleRunTest, testActions } = useTestActions(section, values);
  const showFooter = useMemo(() => !autoSave && typeof onSave === 'function', [autoSave, onSave]);

  return (
    <section className={cn('flex flex-col gap-5', className)}>
      <SectionHeader
        title={section.title}
        description={section.description}
        headerSlot={headerSlot}
      />
      <div className="flex flex-col gap-4">
        {section.fields.map((field) => (
          <SettingsFieldRow
            key={field.id}
            field={field}
            sectionId={section.id}
            value={values[field.id] ?? field.defaultValue ?? ''}
            error={errors[field.id]}
            saving={saving}
            loadedOptions={loadedOptions}
            update={update}
          />
        ))}
      </div>
      <TestActionsPanel testActions={testActions} testStatus={testStatus} onRun={handleRunTest} />
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
