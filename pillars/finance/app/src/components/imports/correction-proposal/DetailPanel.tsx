import { Label, Separator, Textarea } from '@pops/ui';

import { EditDataEditor, RuleDataEditor } from './detail-panel/Editors';

import type { CorrectionRule } from '../RulePicker';
import type { LocalOp } from './types';

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

function AddOpView({
  op,
  onChange,
  disabled,
}: {
  op: Extract<LocalOp, { kind: 'add' }>;
  onChange: (mutator: (op: LocalOp) => LocalOp) => void;
  disabled: boolean;
}) {
  return (
    <div className="p-6 overflow-auto space-y-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">Add new rule</div>
      <RuleDataEditor
        data={op.data}
        onChange={(next) =>
          onChange((current) => (current.kind === 'add' ? { ...current, data: next } : current))
        }
        disabled={disabled}
      />
    </div>
  );
}

function EditOpView({
  op,
  onChange,
  disabled,
}: {
  op: Extract<LocalOp, { kind: 'edit' }>;
  onChange: (mutator: (op: LocalOp) => LocalOp) => void;
  disabled: boolean;
}) {
  return (
    <div className="p-6 overflow-auto space-y-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">Edit rule</div>
      <TargetRuleCard rule={op.targetRule} targetRuleId={op.targetRuleId} />
      <Separator />
      <EditDataEditor
        data={op.data}
        onChange={(next) =>
          onChange((current) => (current.kind === 'edit' ? { ...current, data: next } : current))
        }
        disabled={disabled}
      />
    </div>
  );
}

function DisableRemoveOpView({
  op,
  onChange,
  disabled,
}: {
  op: Extract<LocalOp, { kind: 'disable' | 'remove' }>;
  onChange: (mutator: (op: LocalOp) => LocalOp) => void;
  disabled: boolean;
}) {
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
          onChange={(e) =>
            onChange((current) =>
              current.kind === 'disable' || current.kind === 'remove'
                ? { ...current, rationale: e.target.value }
                : current
            )
          }
          placeholder="Why is this rule being removed?"
          rows={3}
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
  if (op.kind === 'add') return <AddOpView op={op} onChange={onChange} disabled={disabled} />;
  if (op.kind === 'edit') return <EditOpView op={op} onChange={onChange} disabled={disabled} />;
  return <DisableRemoveOpView op={op} onChange={onChange} disabled={disabled} />;
}
