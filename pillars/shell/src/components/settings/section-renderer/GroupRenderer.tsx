import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@pops/ui';

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
    <Card>
      <CardHeader>
        <CardTitle>{group.title}</CardTitle>
        {group.description && <CardDescription>{group.description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">
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
      </CardContent>
    </Card>
  );
}
