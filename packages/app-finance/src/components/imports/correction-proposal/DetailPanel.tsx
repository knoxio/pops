import { Input, Label, Select, Separator, Textarea } from '@pops/ui';

import type { CorrectionRule } from '../RulePicker';
import type { AddRuleData, EditRuleData, LocalOp } from './types';

function TargetRuleCard(props: { rule: CorrectionRule | null; targetRuleId: string }) {
  if (!props.rule) {
    return (
      <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
        Targets rule <code className="text-xs">{props.targetRuleId}</code> (details unavailable)
      </div>
    );
  }
  const r = props.rule;
  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-1">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">Target rule</div>
      <div className="text-sm">
        <code className="rounded bg-background px-1 py-0.5 text-xs">{r.descriptionPattern}</code> ·{' '}
        <span className="text-xs">{r.matchType}</span>
      </div>
      <div className="text-xs text-muted-foreground">
        {[r.entityName, r.location, r.transactionType].filter(Boolean).join(' · ') ||
          'no outcome set'}
      </div>
    </div>
  );
}

function RuleDataEditor(props: {
  data: AddRuleData;
  onChange: (next: AddRuleData) => void;
  disabled: boolean;
  mode: 'add';
}) {
  const { data, onChange, disabled } = props;
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Description pattern</Label>
        <Input
          value={data.descriptionPattern}
          onChange={(e) => {
            onChange({ ...data, descriptionPattern: e.target.value });
          }}
          disabled={disabled}
        />
      </div>
      <div className="space-y-1">
        <Label>Match type</Label>
        <Select
          value={data.matchType}
          onChange={(e) => {
            onChange({
              ...data,
              matchType: e.target.value as 'exact' | 'contains' | 'regex',
            });
          }}
          options={[
            { value: 'exact', label: 'Exact' },
            { value: 'contains', label: 'Contains' },
            { value: 'regex', label: 'Regex' },
          ]}
          disabled={disabled}
        />
      </div>
      <div className="space-y-1">
        <Label>Entity name</Label>
        <Input
          value={data.entityName ?? ''}
          onChange={(e) => {
            onChange({ ...data, entityName: e.target.value || undefined });
          }}
          placeholder="e.g. Woolworths"
          disabled={disabled}
        />
      </div>
      <div className="space-y-1">
        <Label>Transaction type</Label>
        <Select
          value={data.transactionType ?? ''}
          onChange={(e) => {
            onChange({
              ...data,
              transactionType:
                e.target.value === ''
                  ? undefined
                  : (e.target.value as 'purchase' | 'transfer' | 'income'),
            });
          }}
          options={[
            { value: '', label: '— none —' },
            { value: 'purchase', label: 'Purchase' },
            { value: 'transfer', label: 'Transfer' },
            { value: 'income', label: 'Income' },
          ]}
          disabled={disabled}
        />
      </div>
      <div className="space-y-1">
        <Label>Location</Label>
        <Input
          value={data.location ?? ''}
          onChange={(e) => {
            onChange({ ...data, location: e.target.value || undefined });
          }}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

function EditDataEditor(props: {
  data: EditRuleData;
  onChange: (next: EditRuleData) => void;
  disabled: boolean;
}) {
  const { data, onChange, disabled } = props;
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Entity name</Label>
        <Input
          value={data.entityName ?? ''}
          onChange={(e) => {
            onChange({ ...data, entityName: e.target.value || undefined });
          }}
          disabled={disabled}
        />
      </div>
      <div className="space-y-1">
        <Label>Transaction type</Label>
        <Select
          value={data.transactionType ?? ''}
          onChange={(e) => {
            onChange({
              ...data,
              transactionType:
                e.target.value === ''
                  ? undefined
                  : (e.target.value as 'purchase' | 'transfer' | 'income'),
            });
          }}
          options={[
            { value: '', label: '— none —' },
            { value: 'purchase', label: 'Purchase' },
            { value: 'transfer', label: 'Transfer' },
            { value: 'income', label: 'Income' },
          ]}
          disabled={disabled}
        />
      </div>
      <div className="space-y-1">
        <Label>Location</Label>
        <Input
          value={data.location ?? ''}
          onChange={(e) => {
            onChange({ ...data, location: e.target.value || undefined });
          }}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

export function DetailPanel(props: {
  op: LocalOp | null;
  onChange: (mutator: (op: LocalOp) => LocalOp) => void;
  disabled: boolean;
}) {
  const { op, onChange, disabled } = props;
  if (!op) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Select an operation on the left to edit its details.
      </div>
    );
  }

  if (op.kind === 'add') {
    return (
      <div className="p-6 overflow-auto space-y-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Add new rule</div>
        <RuleDataEditor
          data={op.data}
          onChange={(next) => {
            onChange((current) => {
              if (current.kind !== 'add') return current;
              return { ...current, data: next };
            });
          }}
          disabled={disabled}
          mode="add"
        />
      </div>
    );
  }

  if (op.kind === 'edit') {
    return (
      <div className="p-6 overflow-auto space-y-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Edit rule</div>
        <TargetRuleCard rule={op.targetRule} targetRuleId={op.targetRuleId} />
        <Separator />
        <EditDataEditor
          data={op.data}
          onChange={(next) => {
            onChange((current) => {
              if (current.kind !== 'edit') return current;
              return { ...current, data: next };
            });
          }}
          disabled={disabled}
        />
      </div>
    );
  }

  // disable / remove
  return (
    <div className="p-6 overflow-auto space-y-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {op.kind === 'disable' ? 'Disable rule' : 'Remove rule'}
      </div>
      <TargetRuleCard rule={op.targetRule} targetRuleId={op.targetRuleId} />
      <div className="space-y-2">
        <Label>Rationale (optional)</Label>
        <Textarea
          value={op.rationale}
          onChange={(e) => {
            onChange((current) => {
              if (current.kind !== 'disable' && current.kind !== 'remove') return current;
              return { ...current, rationale: e.target.value };
            });
          }}
          placeholder="Why is this rule being removed?"
          rows={3}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
