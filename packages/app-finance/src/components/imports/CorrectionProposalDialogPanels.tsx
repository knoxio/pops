import { Badge, Button, Input, Label, Select, Separator, Textarea } from '@pops/ui';
import { Plus, RefreshCcw, Sparkles, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import {
  type AddRuleData,
  type CorrectionSignal,
  type EditRuleData,
  type LocalOp,
  matchTypeLabel,
  opKindBadgeVariant,
  opKindLabel,
  opSummary,
  PREVIEW_CHANGESET_MAX_TRANSACTIONS,
  type PreviewChangeSetOutput,
  type TriggeringTransactionContext,
} from './correction-proposal-shared';
import { type CorrectionRule, RulePicker } from './RulePicker';

// ---------------------------------------------------------------------------
// Local types used only by panels
// ---------------------------------------------------------------------------

export type PreviewView = 'selected' | 'combined';

export interface AiMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Format the user's correction as a "was -> now" diff line, derived from the
 * difference between the triggering transaction's pre-correction snapshot and
 * the current correction signal. Returns null when there is nothing to show
 * (e.g. signal is missing both entity and transaction type changes).
 *
 * Brand-new entity assignments (no previous entity) collapse to
 * `assigned entity: <name>`.
 */
function formatCorrectionDiff(
  signal: CorrectionSignal,
  triggering: TriggeringTransactionContext
): string | null {
  const parts: string[] = [];

  const newEntity = signal.entityName ?? null;
  const oldEntity = triggering.previousEntityName ?? null;
  if (newEntity && !oldEntity) {
    parts.push(`assigned entity: ${newEntity}`);
  } else if (newEntity && oldEntity && newEntity !== oldEntity) {
    parts.push(`entity: ${oldEntity} → ${newEntity}`);
  }

  const newType = signal.transactionType ?? null;
  const oldType = triggering.previousTransactionType ?? null;
  if (newType && newType !== oldType) {
    parts.push(oldType ? `type: ${oldType} → ${newType}` : `type: ${newType}`);
  }

  const newLocation = signal.location ?? null;
  const oldLocation = triggering.location ?? null;
  if (newLocation && newLocation !== oldLocation) {
    parts.push(
      oldLocation ? `location: ${oldLocation} → ${newLocation}` : `location: ${newLocation}`
    );
  }

  return parts.length > 0 ? parts.join(' · ') : null;
}

function formatCurrency(amount: number): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return amount.toFixed(2);
  }
}

export function ContextPanel(props: {
  signal: CorrectionSignal;
  triggeringTransaction: TriggeringTransactionContext | null;
  rationale: string | null;
  opCount: number;
  combinedSummary: PreviewChangeSetOutput['summary'] | null;
}) {
  const { signal, triggeringTransaction, rationale, opCount, combinedSummary } = props;
  const diff = triggeringTransaction ? formatCorrectionDiff(signal, triggeringTransaction) : null;
  return (
    <div className="px-6 py-3 bg-muted/30 border-t space-y-3">
      {triggeringTransaction && (
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Triggering transaction
          </div>
          <div className="text-sm font-mono break-all" data-testid="triggering-description">
            {triggeringTransaction.description}
          </div>
          <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
            <span data-testid="triggering-amount">
              {formatCurrency(triggeringTransaction.amount)}
            </span>
            <span data-testid="triggering-date">{triggeringTransaction.date}</span>
            <span data-testid="triggering-account">{triggeringTransaction.account}</span>
            {triggeringTransaction.location && (
              <span>location: {triggeringTransaction.location}</span>
            )}
          </div>
          {diff && (
            <div className="text-xs text-foreground" data-testid="triggering-diff">
              {diff}
            </div>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Proposed rule</div>
          <div className="text-sm">
            When description <strong>{matchTypeLabel(signal.matchType)}</strong>{' '}
            <code className="rounded bg-background px-1 py-0.5 text-xs">
              {signal.descriptionPattern}
            </code>
            {signal.entityName && (
              <>
                {' '}
                → <strong>{signal.entityName}</strong>
              </>
            )}
            {signal.transactionType && (
              <>
                {' '}
                · type <strong>{signal.transactionType}</strong>
              </>
            )}
            {signal.location && (
              <>
                {' '}
                · location <strong>{signal.location}</strong>
              </>
            )}
          </div>
          {rationale && <div className="text-xs text-muted-foreground">{rationale}</div>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {opCount} op{opCount === 1 ? '' : 's'}
          </Badge>
          {combinedSummary && (
            <>
              <Badge variant="secondary">{combinedSummary.newMatches} new</Badge>
              <Badge variant="secondary">{combinedSummary.removedMatches} removed</Badge>
              <Badge variant="secondary">{combinedSummary.statusChanges} status</Badge>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function OpsListPanel(props: {
  ops: LocalOp[];
  selectedClientId: string | null;
  onSelect: (clientId: string) => void;
  onDelete: (clientId: string) => void;
  onAddNewRule: () => void;
  onAddTargeted: (kind: 'edit' | 'disable' | 'remove', rule: CorrectionRule) => void;
  excludeIds: ReadonlySet<string>;
  disabled: boolean;
}) {
  const [addMode, setAddMode] = useState<'menu' | 'edit' | 'disable' | 'remove' | null>(null);
  return (
    <div className="flex flex-col min-h-0 border-r">
      <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b">
        Operations ({props.ops.length})
      </div>
      <div className="flex-1 overflow-auto">
        {props.ops.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            ChangeSet is empty. Add an operation below.
          </div>
        ) : (
          <ul className="divide-y">
            {props.ops.map((op) => {
              const selected = op.clientId === props.selectedClientId;
              return (
                <li
                  key={op.clientId}
                  className={`px-3 py-2 cursor-pointer hover:bg-muted/50 ${
                    selected ? 'bg-muted' : ''
                  }`}
                  onClick={() => props.onSelect(op.clientId)}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant={opKindBadgeVariant(op.kind)}
                          className="text-[10px] h-4 px-1.5"
                        >
                          {opKindLabel(op.kind)}
                        </Badge>
                        {op.dirty && (
                          <span
                            className="h-1.5 w-1.5 rounded-full bg-amber-500"
                            title="Unsaved edits — preview stale"
                          />
                        )}
                      </div>
                      <div className="text-xs truncate" title={opSummary(op)}>
                        {opSummary(op)}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive p-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        props.onDelete(op.clientId);
                      }}
                      disabled={props.disabled}
                      aria-label="Delete operation"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="border-t p-2 space-y-2">
        {addMode === null && (
          <Button
            size="sm"
            variant="outline"
            className="w-full justify-start"
            onClick={() => setAddMode('menu')}
            disabled={props.disabled}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Add operation
          </Button>
        )}
        {addMode === 'menu' && (
          <div className="space-y-1">
            <Button
              size="sm"
              variant="ghost"
              className="w-full justify-start"
              onClick={() => {
                props.onAddNewRule();
                setAddMode(null);
              }}
            >
              Add new rule
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="w-full justify-start"
              onClick={() => setAddMode('edit')}
            >
              Edit existing rule…
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="w-full justify-start"
              onClick={() => setAddMode('disable')}
            >
              Disable existing rule…
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="w-full justify-start"
              onClick={() => setAddMode('remove')}
            >
              Remove existing rule…
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="w-full justify-start text-muted-foreground"
              onClick={() => setAddMode(null)}
            >
              <X className="mr-1 h-3.5 w-3.5" /> Cancel
            </Button>
          </div>
        )}
        {(addMode === 'edit' || addMode === 'disable' || addMode === 'remove') && (
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground px-1">Pick a rule to {addMode}</div>
            <RulePicker
              value={null}
              excludeIds={props.excludeIds}
              onChange={(rule) => {
                props.onAddTargeted(addMode, rule);
                setAddMode(null);
              }}
            />
            <Button
              size="sm"
              variant="ghost"
              className="w-full justify-start text-muted-foreground"
              onClick={() => setAddMode(null)}
            >
              <X className="mr-1 h-3.5 w-3.5" /> Cancel
            </Button>
          </div>
        )}
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
          onChange={(next) =>
            onChange((current) => {
              if (current.kind !== 'add') return current;
              return { ...current, data: next };
            })
          }
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
          onChange={(next) =>
            onChange((current) => {
              if (current.kind !== 'edit') return current;
              return { ...current, data: next };
            })
          }
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
          onChange={(e) =>
            onChange((current) => {
              if (current.kind !== 'disable' && current.kind !== 'remove') return current;
              return { ...current, rationale: e.target.value };
            })
          }
          placeholder="Why is this rule being removed?"
          rows={3}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

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
          onChange={(e) => onChange({ ...data, descriptionPattern: e.target.value })}
          disabled={disabled}
        />
      </div>
      <div className="space-y-1">
        <Label>Match type</Label>
        <Select
          value={data.matchType}
          onChange={(e) =>
            onChange({
              ...data,
              matchType: e.target.value as 'exact' | 'contains' | 'regex',
            })
          }
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
          onChange={(e) => onChange({ ...data, entityName: e.target.value || undefined })}
          placeholder="e.g. Woolworths"
          disabled={disabled}
        />
      </div>
      <div className="space-y-1">
        <Label>Transaction type</Label>
        <Select
          value={data.transactionType ?? ''}
          onChange={(e) =>
            onChange({
              ...data,
              transactionType:
                e.target.value === ''
                  ? undefined
                  : (e.target.value as 'purchase' | 'transfer' | 'income'),
            })
          }
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
          onChange={(e) => onChange({ ...data, location: e.target.value || undefined })}
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
          onChange={(e) => onChange({ ...data, entityName: e.target.value || undefined })}
          disabled={disabled}
        />
      </div>
      <div className="space-y-1">
        <Label>Transaction type</Label>
        <Select
          value={data.transactionType ?? ''}
          onChange={(e) =>
            onChange({
              ...data,
              transactionType:
                e.target.value === ''
                  ? undefined
                  : (e.target.value as 'purchase' | 'transfer' | 'income'),
            })
          }
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
          onChange={(e) => onChange({ ...data, location: e.target.value || undefined })}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

export function ImpactPanel(props: {
  view: PreviewView;
  onViewChange: (v: PreviewView) => void;
  label: string;
  previewResult: PreviewChangeSetOutput | null;
  previewError: string | null;
  isPending: boolean;
  stale: boolean;
  truncated: boolean;
  onRerun: () => void;
  disabled: boolean;
}) {
  const { previewResult, previewError } = props;
  return (
    <div className="flex flex-col min-h-0 border-l">
      <div className="px-4 py-2 border-b flex items-center gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex-1">
          Impact
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={props.onRerun}
          disabled={props.disabled}
          title="Re-run preview"
        >
          <RefreshCcw className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="px-4 py-2 border-b flex gap-1">
        <Button
          size="sm"
          variant={props.view === 'selected' ? 'default' : 'outline'}
          onClick={() => props.onViewChange('selected')}
          className="flex-1"
        >
          Selected
        </Button>
        <Button
          size="sm"
          variant={props.view === 'combined' ? 'default' : 'outline'}
          onClick={() => props.onViewChange('combined')}
          className="flex-1"
        >
          Combined
        </Button>
      </div>
      <div className="px-4 py-2 text-xs text-muted-foreground">
        {props.label}
        {props.stale && <span className="ml-2 text-amber-600">(stale)</span>}
        {props.truncated && (
          <span
            className="ml-2 text-amber-600"
            title={`Previewed against the first ${PREVIEW_CHANGESET_MAX_TRANSACTIONS} matching transactions. The counts below are an under-count — narrow the pattern or re-run after importing in smaller batches to see full impact.`}
          >
            (preview truncated)
          </span>
        )}
      </div>
      <div className="flex-1 overflow-auto px-4 pb-4">
        {previewError ? (
          <div className="text-sm text-destructive">{previewError}</div>
        ) : props.isPending && !previewResult ? (
          <div className="text-sm text-muted-foreground">Computing preview…</div>
        ) : !previewResult ? (
          <div className="text-sm text-muted-foreground">No preview yet.</div>
        ) : (
          <ImpactContent result={previewResult} />
        )}
      </div>
    </div>
  );
}

function ImpactContent(props: { result: PreviewChangeSetOutput }) {
  const { diffs, summary } = props.result;
  const changed = diffs.filter((d) => d.changed);
  const unchanged = diffs.filter((d) => !d.changed);
  const MAX_CHANGED = 100;
  const MAX_UNCHANGED = 30;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="secondary" className="text-[10px]">
          {summary.total} checked
        </Badge>
        <Badge variant="secondary" className="text-[10px]">
          +{summary.newMatches}
        </Badge>
        <Badge variant="secondary" className="text-[10px]">
          -{summary.removedMatches}
        </Badge>
        <Badge variant="secondary" className="text-[10px]">
          {summary.statusChanges} Δ
        </Badge>
      </div>
      {changed.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Will change ({changed.length})
          </div>
          {changed.slice(0, MAX_CHANGED).map((d) => (
            <div
              key={`c-${d.checksum ?? d.description}`}
              className="text-xs rounded border-l-2 border-primary pl-2"
            >
              <div className="font-medium truncate">{d.description}</div>
              <div className="text-[10px] text-muted-foreground">
                {d.before.matched ? d.before.status : 'unmatched'} →{' '}
                {d.after.matched ? d.after.status : 'unmatched'}
              </div>
            </div>
          ))}
          {changed.length > MAX_CHANGED && (
            <div className="text-[10px] text-muted-foreground">
              Showing first {MAX_CHANGED} of {changed.length}.
            </div>
          )}
        </div>
      )}
      {unchanged.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Already matching ({unchanged.length})
          </div>
          {unchanged.slice(0, MAX_UNCHANGED).map((d) => (
            <div
              key={`u-${d.checksum ?? d.description}`}
              className="text-xs text-muted-foreground truncate"
            >
              {d.description}
            </div>
          ))}
          {unchanged.length > MAX_UNCHANGED && (
            <div className="text-[10px] text-muted-foreground">
              Showing first {MAX_UNCHANGED} of {unchanged.length}.
            </div>
          )}
        </div>
      )}
      {changed.length === 0 && unchanged.length === 0 && (
        <div className="text-xs text-muted-foreground">
          No transactions in the current import match this scope.
        </div>
      )}
    </div>
  );
}

export function AiHelperPanel(props: {
  messages: AiMessage[];
  instruction: string;
  onInstructionChange: (v: string) => void;
  onSubmit: () => void;
  busy: boolean;
}) {
  return (
    <div className="border-t bg-muted/20 px-6 py-3 space-y-2 max-h-48 flex flex-col">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5" />
        AI helper
      </div>
      {props.messages.length > 0 && (
        <div className="flex-1 overflow-auto space-y-1.5 max-h-24">
          {props.messages.map((m) => (
            <div
              key={m.id}
              className={`text-xs ${
                m.role === 'user' ? 'text-foreground' : 'text-muted-foreground italic'
              }`}
            >
              <span className="font-semibold mr-1">{m.role === 'user' ? 'You:' : 'AI:'}</span>
              {m.text}
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          value={props.instruction}
          onChange={(e) => props.onInstructionChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              props.onSubmit();
            }
          }}
          placeholder="e.g. split location into its own rule, or exclude transfers"
          disabled={props.busy}
          className="flex-1"
        />
        <Button onClick={props.onSubmit} disabled={props.busy || !props.instruction.trim()}>
          {props.busy ? '…' : 'Send'}
        </Button>
      </div>
    </div>
  );
}

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

      <div className="rounded-md border bg-muted/30 p-3 space-y-2">
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Pattern</div>
          <code className="text-sm rounded bg-background px-1 py-0.5">
            {rule.descriptionPattern}
          </code>
          <span className="ml-2 text-xs text-muted-foreground">{rule.matchType}</span>
        </div>
        {rule.entityName && (
          <div className="space-y-0.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Entity</div>
            <div className="text-sm">{rule.entityName}</div>
          </div>
        )}
        {rule.transactionType && (
          <div className="space-y-0.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Type</div>
            <div className="text-sm">{rule.transactionType}</div>
          </div>
        )}
        {rule.location && (
          <div className="space-y-0.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Location
            </div>
            <div className="text-sm">{rule.location}</div>
          </div>
        )}
        <div className="flex gap-4 text-xs text-muted-foreground pt-1">
          <span>confidence: {(rule.confidence * 100).toFixed(0)}%</span>
          {rule.timesApplied != null && <span>applied: {rule.timesApplied}×</span>}
        </div>
      </div>

      <Separator />

      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => props.onEdit(rule)}>
          Edit
        </Button>
        {rule.isActive ? (
          <Button size="sm" variant="outline" onClick={() => props.onDisable(rule)}>
            Disable
          </Button>
        ) : null}
        <Button size="sm" variant="destructive" onClick={() => props.onRemove(rule)}>
          Remove
        </Button>
      </div>
    </div>
  );
}

export function RejectPanel(props: {
  feedback: string;
  onFeedbackChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  return (
    <div className="border-t bg-destructive/5 px-6 py-3 space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-destructive">
        Reject with feedback
      </div>
      <div className="text-xs text-muted-foreground">
        Reject is the escape hatch for "this whole direction is wrong". For day-to-day refinement,
        edit operations in place or use the AI helper.
      </div>
      <Textarea
        value={props.feedback}
        onChange={(e) => props.onFeedbackChange(e.target.value)}
        placeholder="Why is this proposal wrong?"
        rows={2}
        disabled={props.busy}
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={props.onCancel} disabled={props.busy}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={props.onConfirm}
          disabled={props.busy || !props.feedback.trim()}
        >
          {props.busy ? 'Rejecting…' : 'Confirm reject'}
        </Button>
      </div>
    </div>
  );
}
