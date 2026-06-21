/**
 * Shared types for the CorrectionProposalDialog system.
 *
 * Extracted from correction-proposal-shared.ts and CorrectionProposalDialogPanels.tsx (tb-365).
 */
import type {
  CorrectionsPreviewChangeSetData,
  CorrectionsPreviewChangeSetResponse,
  CorrectionsProposeChangeSetData,
  CorrectionsProposeChangeSetResponse,
  CorrectionsRejectChangeSetData,
  CorrectionsReviseChangeSetData,
  CorrectionsReviseChangeSetResponse,
} from '../../../finance-api/index.js';
import type { CorrectionRule } from '../RulePicker';

export type CorrectionSignal = NonNullable<CorrectionsProposeChangeSetData['body']>['signal'];
export type PreviewChangeSetInput = NonNullable<CorrectionsPreviewChangeSetData['body']>;
export type PreviewChangeSetOutput = CorrectionsPreviewChangeSetResponse;
export type RejectChangeSetInput = NonNullable<CorrectionsRejectChangeSetData['body']>;
export type ReviseChangeSetInput = NonNullable<CorrectionsReviseChangeSetData['body']>;
export type ReviseChangeSetOutput = CorrectionsReviseChangeSetResponse;
export type ProposeChangeSetInput = NonNullable<CorrectionsProposeChangeSetData['body']>;
export type ProposeChangeSetOutput = CorrectionsProposeChangeSetResponse;
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
