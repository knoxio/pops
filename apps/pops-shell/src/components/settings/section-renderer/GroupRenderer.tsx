import { FieldInput } from './FieldInput';

import type { SettingsGroup } from '@pops/types';

import type { SaveState } from './types';

interface GroupRendererProps {
  group: SettingsGroup;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onTestAction: (procedure: string) => Promise<void>;
  dbValues: Record<string, string>;
  saveStates: Record<string, SaveState>;
  loadingOptionKeys: Set<string>;
}

export function GroupRenderer({
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
