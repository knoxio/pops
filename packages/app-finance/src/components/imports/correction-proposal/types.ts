/**
 * Shared types for the CorrectionProposalDialog system.
 *
 * Extracted from correction-proposal-shared.ts and CorrectionProposalDialogPanels.tsx (tb-365).
 */
import type { AppRouter } from '@pops/api-client';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

import type { CorrectionRule } from '../RulePicker';

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

export type { ServerChangeSet, ServerChangeSetOp };

// ---------------------------------------------------------------------------
// Local op model
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Panel-specific types
// ---------------------------------------------------------------------------

export type PreviewView = 'selected' | 'combined';

export interface AiMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

/**
 * The transaction that triggered this proposal, plus the user's pre-correction
 * snapshot. Rendered prominently so the reviewer can reason about why the
 * proposed rule is shaped the way it is.
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
