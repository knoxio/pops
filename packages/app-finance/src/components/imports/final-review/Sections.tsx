import {
  type ChangeSetOp,
  OP_BADGE,
  opDisplayLabel,
  type TagRuleChangeSetOp,
  tagRuleOpDisplayLabel,
} from './op-helpers';
import { Section } from './Section';

import type {
  PendingChangeSet,
  PendingEntity,
  PendingTagRuleChangeSet,
} from '../../../store/importStore';

interface OpRowProps {
  badge: (typeof OP_BADGE)[string] | undefined;
  label: string;
  rowKey: string;
}

function OpRow({ badge, label, rowKey }: OpRowProps) {
  return (
    <li key={rowKey} className="flex items-center gap-2 text-sm py-0.5">
      {badge && (
        <span
          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${badge.className}`}
        >
          {badge.icon}
          {badge.label}
        </span>
      )}
      <span className="font-mono text-xs truncate">{label}</span>
    </li>
  );
}

export function EntitiesSection({ entities }: { entities: PendingEntity[] }) {
  if (entities.length === 0) return null;
  return (
    <Section title="New Entities" count={entities.length}>
      <ul className="space-y-1">
        {entities.map((entity) => (
          <li key={entity.tempId} className="flex items-center gap-2 text-sm py-1">
            <span className="font-medium">{entity.name}</span>
            <span className="text-muted-foreground text-xs">({entity.type})</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function ClassificationRulesSection({
  pendingChangeSets,
  totalOps,
}: {
  pendingChangeSets: PendingChangeSet[];
  totalOps: number;
}) {
  if (totalOps === 0) return null;
  return (
    <Section title="Classification Rule Changes" count={totalOps}>
      <div className="space-y-3">
        {pendingChangeSets.map((pcs) => (
          <div key={pcs.tempId} className="space-y-1">
            {pcs.changeSet.source && (
              <p className="text-xs text-muted-foreground">Source: {pcs.changeSet.source}</p>
            )}
            <ul className="space-y-1">
              {pcs.changeSet.ops.map((op) => {
                const rowKey =
                  op.op === 'add'
                    ? `${pcs.tempId}-cor-add-${op.data.descriptionPattern}`
                    : `${pcs.tempId}-cor-${op.op}-${op.id}`;
                return (
                  <OpRow
                    key={rowKey}
                    badge={OP_BADGE[op.op]}
                    label={opDisplayLabel(op as ChangeSetOp)}
                    rowKey={rowKey}
                  />
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}

export function TagRulesSection({
  pendingTagRuleChangeSets,
  totalTagRuleOps,
}: {
  pendingTagRuleChangeSets: PendingTagRuleChangeSet[];
  totalTagRuleOps: number;
}) {
  if (totalTagRuleOps === 0) return null;
  return (
    <Section title="Tag Rule Changes" count={totalTagRuleOps}>
      <div className="space-y-3">
        {pendingTagRuleChangeSets.map((pcs) => (
          <div key={pcs.tempId} className="space-y-1">
            {pcs.changeSet.source && (
              <p className="text-xs text-muted-foreground">Source: {pcs.changeSet.source}</p>
            )}
            <ul className="space-y-1">
              {pcs.changeSet.ops.map((op) => {
                const rowKey =
                  op.op === 'add'
                    ? `${pcs.tempId}-add-${op.data.descriptionPattern}`
                    : `${pcs.tempId}-${op.op}-${op.id}`;
                return (
                  <OpRow
                    key={rowKey}
                    badge={OP_BADGE[op.op]}
                    label={tagRuleOpDisplayLabel(op as TagRuleChangeSetOp)}
                    rowKey={rowKey}
                  />
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}

export interface TxnBreakdown {
  matched: number;
  corrected: number;
  manual: number;
  skipped: number;
  total: number;
}

export function TransactionsSection({ txnBreakdown }: { txnBreakdown: TxnBreakdown }) {
  if (txnBreakdown.total === 0) return null;
  return (
    <Section title="Transactions to Import" count={txnBreakdown.total}>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Matched:</span>
          <span className="font-medium">{txnBreakdown.matched}</span>
        </div>
        {txnBreakdown.corrected > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Corrected:</span>
            <span className="font-medium">{txnBreakdown.corrected}</span>
          </div>
        )}
        {txnBreakdown.manual > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Manual:</span>
            <span className="font-medium">{txnBreakdown.manual}</span>
          </div>
        )}
        {txnBreakdown.skipped > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Skipped:</span>
            <span className="font-medium">{txnBreakdown.skipped}</span>
          </div>
        )}
      </div>
    </Section>
  );
}

export function TagAssignmentsSection({
  tagAssignmentCount,
  taggedTxnCount,
}: {
  tagAssignmentCount: number;
  taggedTxnCount: number;
}) {
  if (tagAssignmentCount === 0) return null;
  return (
    <Section title="Tag Assignments" count={tagAssignmentCount}>
      <p className="text-sm text-muted-foreground">
        {tagAssignmentCount} tag{tagAssignmentCount === 1 ? '' : 's'} will be applied across{' '}
        {taggedTxnCount} transaction{taggedTxnCount === 1 ? '' : 's'}.
      </p>
    </Section>
  );
}
