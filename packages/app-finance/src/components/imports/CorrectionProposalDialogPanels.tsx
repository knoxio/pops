/**
 * Re-export hub for CorrectionProposalDialog panel components.
 *
 * Panel components have been extracted into individual files under
 * `correction-proposal/` (tb-365). This file remains as a re-export
 * barrel so existing consumers are unaffected.
 */
export { AiHelperPanel } from './correction-proposal/AiHelperPanel';
export { BrowseRuleDetailPanel } from './correction-proposal/BrowseRuleDetailPanel';
export { ContextPanel } from './correction-proposal/ContextPanel';
export { DetailPanel } from './correction-proposal/DetailPanel';
export { ImpactPanel } from './correction-proposal/ImpactPanel';
export { OpsListPanel } from './correction-proposal/OpsListPanel';
export { RejectPanel } from './correction-proposal/RejectPanel';
export type { AiMessage, PreviewView } from './correction-proposal/types';
