import { RefreshCw } from 'lucide-react';

import { Button, Label, NumberInput, Select, Switch } from '@pops/ui';

import { SourceConfigFields } from './SourceConfigFields';
import { sourceTypeLabel, type SourceFormValues } from './types';
import { useSourceFormModel } from './useSourceFormModel';

interface SourceFormProps {
  mode: 'create' | 'edit';
  initialValues?: SourceFormValues;
  sourceTypes: string[];
  onClose: () => void;
}

interface CommonFieldsProps {
  name: string;
  setName: (v: string) => void;
  priority: number;
  setPriority: (v: number) => void;
  syncIntervalHours: number;
  setSyncIntervalHours: (v: number) => void;
  enabled: boolean;
  setEnabled: (v: boolean) => void;
}

function NameField({ name, setName }: Pick<CommonFieldsProps, 'name' | 'setName'>) {
  return (
    <div className="space-y-1.5">
      <Label className="text-muted-foreground">Name</Label>
      <input
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
        }}
        placeholder="Source name"
      />
    </div>
  );
}

function NumericFields({
  priority,
  setPriority,
  syncIntervalHours,
  setSyncIntervalHours,
}: Pick<
  CommonFieldsProps,
  'priority' | 'setPriority' | 'syncIntervalHours' | 'setSyncIntervalHours'
>) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label className="text-muted-foreground">Priority (1-10)</Label>
        <NumberInput
          value={priority}
          onChange={(e) => {
            setPriority(Math.min(10, Math.max(1, Number(e.target.value) || 1)));
          }}
          min={1}
          max={10}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-muted-foreground">Sync interval (hours)</Label>
        <NumberInput
          value={syncIntervalHours}
          onChange={(e) => {
            setSyncIntervalHours(Math.max(1, Number(e.target.value) || 1));
          }}
          min={1}
        />
      </div>
    </div>
  );
}

function CommonFields(props: CommonFieldsProps) {
  return (
    <>
      <NameField {...props} />
      <NumericFields {...props} />
      <div className="flex items-center gap-2">
        <Switch checked={props.enabled} onCheckedChange={props.setEnabled} />
        <Label className="text-muted-foreground">Enabled</Label>
      </div>
    </>
  );
}

export function SourceForm({ mode, initialValues, sourceTypes, onClose }: SourceFormProps) {
  const model = useSourceFormModel({ mode, initialValues, sourceTypes, onClose });

  return (
    <div className="rounded-lg border bg-card p-6 space-y-4">
      <h3 className="text-lg font-semibold">{mode === 'create' ? 'Add Source' : 'Edit Source'}</h3>

      {mode === 'create' && (
        <div className="space-y-1.5">
          <Label className="text-muted-foreground">Source Type</Label>
          <Select
            value={model.type}
            onChange={(e) => {
              model.setType(e.target.value);
              model.setConfigValues({});
            }}
            options={sourceTypes.map((t) => ({ value: t, label: sourceTypeLabel(t) }))}
            size="sm"
          />
        </div>
      )}

      <CommonFields
        name={model.name}
        setName={model.setName}
        priority={model.priority}
        setPriority={model.setPriority}
        syncIntervalHours={model.syncIntervalHours}
        setSyncIntervalHours={model.setSyncIntervalHours}
        enabled={model.enabled}
        setEnabled={model.setEnabled}
      />

      <SourceConfigFields
        type={model.type}
        configValues={model.configValues}
        setConfigValues={model.setConfigValues}
        plexFriendsQuery={model.plexFriendsQuery}
      />

      <div className="flex gap-2">
        <Button onClick={model.handleSubmit} disabled={model.isPending} size="sm">
          {model.isPending ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
          {mode === 'create' ? 'Add Source' : 'Save Changes'}
        </Button>
        <Button variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
