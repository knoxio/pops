import { Badge, Button, Separator } from '@pops/ui';

import type { CorrectionRule } from '../RulePicker';

export function BrowseRuleDetailPanel(props: {
  rule: CorrectionRule;
  onEdit: (rule: CorrectionRule) => void;
  onDisable: (rule: CorrectionRule) => void;
  onRemove: (rule: CorrectionRule) => void;
}) {
  const { rule } = props;
  const isPending = rule.id.startsWith('temp:');
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <div className="text-xs uppercase tracking-wide text-muted-foreground flex-1">
          Rule details
        </div>
        {isPending && (
          <Badge variant="default" className="text-[10px] bg-amber-500">
            pending
          </Badge>
        )}
        {!rule.isActive && (
          <Badge variant="secondary" className="text-[10px]">
            disabled
          </Badge>
        )}
      </div>

      <RuleDetailFields rule={rule} />

      <Separator />

      <RuleActions
        rule={rule}
        onEdit={props.onEdit}
        onDisable={props.onDisable}
        onRemove={props.onRemove}
      />
    </div>
  );
}

function RuleDetailFields({ rule }: { rule: CorrectionRule }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Pattern</div>
        <code className="text-sm rounded bg-background px-1 py-0.5">{rule.descriptionPattern}</code>
        <span className="ml-2 text-xs text-muted-foreground">{rule.matchType}</span>
      </div>
      {rule.entityName && <DetailField label="Entity" value={rule.entityName} />}
      {rule.transactionType && <DetailField label="Type" value={rule.transactionType} />}
      {rule.location && <DetailField label="Location" value={rule.location} />}
      <div className="flex gap-4 text-xs text-muted-foreground pt-1">
        <span>confidence: {(rule.confidence * 100).toFixed(0)}%</span>
        {rule.timesApplied != null && <span>applied: {rule.timesApplied}×</span>}
      </div>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

function RuleActions({
  rule,
  onEdit,
  onDisable,
  onRemove,
}: {
  rule: CorrectionRule;
  onEdit: (rule: CorrectionRule) => void;
  onDisable: (rule: CorrectionRule) => void;
  onRemove: (rule: CorrectionRule) => void;
}) {
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={() => onEdit(rule)}>
        Edit
      </Button>
      {rule.isActive && (
        <Button size="sm" variant="outline" onClick={() => onDisable(rule)}>
          Disable
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive hover:text-destructive"
        onClick={() => onRemove(rule)}
      >
        Remove
      </Button>
    </div>
  );
}
