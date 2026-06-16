/**
 * Internal TS shapes for the tag-rules domain logic. The zod request/
 * response schemas live in the REST contract (`rest-tag-rules.ts`); these
 * interfaces back the deterministic preview/propose computation.
 */
import type { TagRuleChangeSet } from '../../../contract/rest-tag-rules.js';

export type TagSuggestionSource = 'tag_rule' | 'rule' | 'ai' | 'entity';

export interface TagSuggestion {
  tag: string;
  source: TagSuggestionSource;
  pattern?: string;
  /** True when the tag is not yet in the user vocabulary. */
  isNew?: boolean;
}

export interface TagRuleSuggestionOutcome {
  suggestedTags: TagSuggestion[];
}

export interface TagRuleImpactCounts {
  affected: number;
  suggestionChanges: number;
  newTagProposals: number;
}

export interface TagRuleImpactItem {
  transactionId: string;
  description: string;
  before: TagRuleSuggestionOutcome;
  after: TagRuleSuggestionOutcome;
}

export interface TagRulePreview {
  counts: TagRuleImpactCounts;
  affected: TagRuleImpactItem[];
}

export interface TagRuleChangeSetProposal {
  changeSet: TagRuleChangeSet;
  rationale: string;
  preview: TagRulePreview;
}

/** A transaction the caller wants previewed against a ChangeSet. */
export interface PreviewInputTransaction {
  transactionId: string;
  description: string;
  entityId?: string | null;
  /** User-entered tags in the current import; rule suggestions never override these. */
  userTags?: string[];
}
