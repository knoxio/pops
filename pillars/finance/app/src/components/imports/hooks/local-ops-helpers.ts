import type {
  CorrectionSignal,
  LocalOp,
  OpKind,
  ServerChangeSet,
  ServerChangeSetOp,
} from '../correction-proposal-shared';
import type { CorrectionRule } from '../RulePicker';

let clientIdCounter = 0;
export function newClientId(prefix: OpKind): string {
  clientIdCounter += 1;
  return `${prefix}-${clientIdCounter}-${Date.now().toString(36)}`;
}

function serverNonAddToLocal(
  op: Extract<ServerChangeSetOp, { op: 'edit' | 'disable' | 'remove' }>,
  hydrated: CorrectionRule | null
): LocalOp {
  if (op.op === 'edit') {
    return {
      kind: 'edit',
      clientId: newClientId('edit'),
      targetRuleId: op.id,
      targetRule: hydrated,
      data: op.data,
      dirty: false,
    };
  }
  if (op.op === 'disable') {
    return {
      kind: 'disable',
      clientId: newClientId('disable'),
      targetRuleId: op.id,
      targetRule: hydrated,
      rationale: '',
      dirty: false,
    };
  }
  return {
    kind: 'remove',
    clientId: newClientId('remove'),
    targetRuleId: op.id,
    targetRule: hydrated,
    rationale: '',
    dirty: false,
  };
}

/**
 * Convert a server ChangeSet op into its client-side counterpart.
 */
export function serverOpToLocalOp(
  op: ServerChangeSetOp,
  targetRules: Record<string, CorrectionRule>
): LocalOp {
  if (op.op === 'add') {
    return { kind: 'add', clientId: newClientId('add'), data: op.data, dirty: false };
  }
  return serverNonAddToLocal(op, targetRules[op.id] ?? null);
}

export function localOpToServerOp(op: LocalOp): ServerChangeSetOp {
  if (op.kind === 'add') return { op: 'add', data: op.data };
  if (op.kind === 'edit') return { op: 'edit', id: op.targetRuleId, data: op.data };
  if (op.kind === 'disable') return { op: 'disable', id: op.targetRuleId };
  return { op: 'remove', id: op.targetRuleId };
}

export function localOpsToChangeSet(
  ops: LocalOp[],
  extras?: { source?: string; reason?: string }
): ServerChangeSet | null {
  if (ops.length === 0) return null;
  return {
    source: extras?.source ?? 'correction-proposal-dialog',
    reason: extras?.reason,
    ops: ops.map(localOpToServerOp),
  };
}

export function newAddOpFromSignal(signal: CorrectionSignal): LocalOp {
  return {
    kind: 'add',
    clientId: newClientId('add'),
    data: {
      descriptionPattern: signal.descriptionPattern,
      matchType: signal.matchType,
      entityId: signal.entityId ?? undefined,
      entityName: signal.entityName ?? undefined,
      location: signal.location ?? undefined,
      tags: signal.tags ?? [],
      transactionType: signal.transactionType ?? undefined,
    },
    dirty: true,
  };
}

export function newTargetedOp(kind: 'edit' | 'disable' | 'remove', rule: CorrectionRule): LocalOp {
  if (kind === 'edit') {
    return {
      kind: 'edit',
      clientId: newClientId('edit'),
      targetRuleId: rule.id,
      targetRule: rule,
      data: {
        entityId: rule.entityId ?? undefined,
        entityName: rule.entityName ?? undefined,
        location: rule.location ?? undefined,
        tags: rule.tags,
        transactionType: rule.transactionType ?? undefined,
        isActive: rule.isActive,
        confidence: rule.confidence,
      },
      dirty: true,
    };
  }
  return {
    kind,
    clientId: newClientId(kind),
    targetRuleId: rule.id,
    targetRule: rule,
    rationale: '',
    dirty: true,
  } as LocalOp;
}
