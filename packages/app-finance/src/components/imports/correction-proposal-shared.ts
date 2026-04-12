/**
 * Shared types, constants, and utility functions for the CorrectionProposalDialog
 * and CorrectionProposalDialogPanels modules.
 *
 * Extracted to break a circular dependency: Dialog imports panel components from
 * Panels, and Panels imports types/utils from Dialog. This shared module is
 * imported by both without either importing the other for these symbols.
 */
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@pops/api-client';
import type { CorrectionRule } from './RulePicker';

// ---------------------------------------------------------------------------
// tRPC type helpers
// ---------------------------------------------------------------------------

export type CorrectionSignal =
  inferRouterInputs<AppRouter>['core']['corrections']['proposeChangeSet']['signal'];
export type PreviewChangeSetOutput =
  inferRouterOutputs<AppRouter>['core']['corrections']['previewChangeSet'];
type ProposeChangeSetOutput =
  inferRouterOutputs<AppRouter>['core']['corrections']['proposeChangeSet'];
type ServerChangeSet = ProposeChangeSetOutput['changeSet'];
type ServerChangeSetOp = ServerChangeSet['ops'][number];
export type AddRuleData = Extract<ServerChangeSetOp, { op: 'add' }>['data'];
export type EditRuleData = Extract<ServerChangeSetOp, { op: 'edit' }>['data'];

// Re-export so Dialog can still use these internally
export type { ServerChangeSet, ServerChangeSetOp };

// ---------------------------------------------------------------------------
// Normalization helpers (reused by tests)
// ---------------------------------------------------------------------------

/** Client-side mirror of the server's normalizeDescription (corrections/types.ts).
 *  Uppercases, strips digits, collapses whitespace. Duplicated here to avoid
 *  pulling server code into the frontend bundle. */
export function normalizeForMatch(value: string): string {
  return value.toUpperCase().replace(/\d+/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Mirror the server matcher in `findMatchingCorrectionFromRules` / the
 * preview pipeline. Semantics:
 *  - For `exact`/`contains`: both sides are normalized via `normalizeForMatch`
 *    (patterns are stored already-normalized in the DB, but we normalize the
 *    client-side pattern too because the user can type a raw value in the
 *    detail editor before the server has a chance to normalize it).
 *  - For `regex`: pattern is kept raw (server stores regex patterns raw) and
 *    tested with `new RegExp(pattern)` — **no `i` flag** — against the
 *    *normalized* description. Using the `i` flag here, or testing against
 *    the raw description, would silently diverge from what the server preview
 *    engine matches and scope out transactions that actually hit on apply.
 */
export function transactionMatchesSignal(
  description: string,
  pattern: string,
  matchType: 'exact' | 'contains' | 'regex'
): boolean {
  const normDesc = normalizeForMatch(description);
  if (matchType === 'regex') {
    if (pattern.length === 0) return false;
    try {
      return new RegExp(pattern).test(normDesc);
    } catch {
      return false;
    }
  }
  const normPattern = normalizeForMatch(pattern);
  if (!normPattern) return false;
  if (matchType === 'exact') return normDesc === normPattern;
  return normDesc.includes(normPattern);
}

/**
 * Server-side cap on `transactions` in `core.corrections.previewChangeSet`
 * (enforced by a zod `.max(2000)`). We mirror it here so the dialog never
 * ships a request that will be rejected. If the user imports more rows than
 * this, we slice the scoped list and surface a "preview truncated" hint in
 * the impact panel so they know the delta numbers are an under-count, not
 * the full picture.
 */
export const PREVIEW_CHANGESET_MAX_TRANSACTIONS = 2000;

// ---------------------------------------------------------------------------
// Local op model
// ---------------------------------------------------------------------------

/**
 * Client-side representation of a ChangeSet operation. Distinct from the server
 * schema because we need:
 *  - a stable `clientId` for React keys and selection (the server `add` op has
 *    no id; `edit`/`disable`/`remove` ids would collide if the user stacks two
 *    ops against the same rule)
 *  - a `dirty` flag to drive the staleness gate for Apply
 *  - a snapshot of the target rule for edit/disable/remove, so the detail panel
 *    can render rule context without re-fetching
 */
export type LocalOp =
  | {
      kind: 'add';
      clientId: string;
      data: AddRuleData;
      dirty: boolean;
    }
  | {
      kind: 'edit';
      clientId: string;
      targetRuleId: string;
      targetRule: CorrectionRule | null;
      data: EditRuleData;
      dirty: boolean;
    }
  | {
      kind: 'disable';
      clientId: string;
      targetRuleId: string;
      targetRule: CorrectionRule | null;
      rationale: string;
      dirty: boolean;
    }
  | {
      kind: 'remove';
      clientId: string;
      targetRuleId: string;
      targetRule: CorrectionRule | null;
      rationale: string;
      dirty: boolean;
    };

export type OpKind = LocalOp['kind'];

interface ScopedPreviewTxnResult<T> {
  txns: T[];
  truncated: boolean;
}

/**
 * Build the scoped transaction list to feed into `previewChangeSet`. For
 * each op in the ChangeSet, keep any transaction whose description would
 * actually be matched by that op (so previews aren't polluted with rows
 * that don't interact with this edit). For `edit`/`disable`/`remove` ops
 * we rely on the hydrated `targetRule`; if hydration is missing for any
 * non-`add` op we bail out of scoping for that entire preview and fall
 * through to the full `previewTransactions` list — otherwise the op's
 * real impact would be invisible in the preview panel.
 *
 * After scoping, the result is hard-capped at
 * `PREVIEW_CHANGESET_MAX_TRANSACTIONS` so we never trip the server zod
 * limit. `truncated === true` if that cap kicked in.
 *
 * Exported for unit testing.
 */
export function scopePreviewTransactions<T extends { description: string }>(
  ops: LocalOp[],
  previewTransactions: readonly T[]
): ScopedPreviewTxnResult<T> {
  const hasUnscopedRuleOp = ops.some((op) => op.kind !== 'add' && !op.targetRule);
  const filtered = hasUnscopedRuleOp
    ? [...previewTransactions]
    : previewTransactions.filter((t) =>
        ops.some((op) => {
          if (op.kind === 'add') {
            return transactionMatchesSignal(
              t.description,
              op.data.descriptionPattern,
              op.data.matchType
            );
          }
          const rule = op.targetRule;
          if (!rule) return false;
          return transactionMatchesSignal(t.description, rule.descriptionPattern, rule.matchType);
        })
      );

  if (filtered.length <= PREVIEW_CHANGESET_MAX_TRANSACTIONS) {
    return { txns: filtered, truncated: false };
  }
  return {
    txns: filtered.slice(0, PREVIEW_CHANGESET_MAX_TRANSACTIONS),
    truncated: true,
  };
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export function opKindLabel(kind: OpKind): string {
  if (kind === 'add') return 'Add rule';
  if (kind === 'edit') return 'Edit rule';
  if (kind === 'disable') return 'Disable rule';
  return 'Remove rule';
}

export function opKindBadgeVariant(
  kind: OpKind
): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (kind === 'add') return 'default';
  if (kind === 'edit') return 'secondary';
  if (kind === 'disable') return 'outline';
  return 'destructive';
}

export function opSummary(op: LocalOp): string {
  if (op.kind === 'add') {
    const pat = op.data.descriptionPattern || '(no pattern)';
    const outcome = op.data.entityName ?? op.data.transactionType ?? 'unclassified';
    return `${pat} → ${outcome}`;
  }
  const pat = op.targetRule?.descriptionPattern ?? '(rule)';
  if (op.kind === 'edit') {
    const outcome = op.data.entityName ?? op.data.transactionType ?? 'edit';
    return `${pat} → ${outcome}`;
  }
  if (op.kind === 'disable') return `${pat} (disable)`;
  return `${pat} (remove)`;
}

export function matchTypeLabel(matchType: 'exact' | 'contains' | 'regex'): string {
  if (matchType === 'exact') return 'matches exactly';
  if (matchType === 'contains') return 'contains';
  return 'matches regex';
}

// ---------------------------------------------------------------------------
// Props types
// ---------------------------------------------------------------------------

/**
 * The transaction that triggered this proposal, plus the user's pre-correction
 * snapshot. Rendered prominently so the reviewer can reason about why the
 * proposed rule is shaped the way it is — without the raw description the
 * reviewer cannot tell whether a bad pattern is the AI's fault or theirs.
 */
export interface TriggeringTransactionContext {
  description: string;
  amount: number;
  date: string;
  account: string;
  location?: string | null;
  previousEntityName?: string | null;
  previousTransactionType?: 'purchase' | 'transfer' | 'income' | null;
}
