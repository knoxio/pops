import { z } from "zod";

// ---------------------------------------------------------------------------
// Tag rule ChangeSet contract (PRD-029) — tag suggestions only (never forced edits)
// ---------------------------------------------------------------------------

export const TagRuleDataSchema = z.object({
  descriptionPattern: z.string().min(1),
  matchType: z.enum(["exact", "contains", "regex"]).default("exact"),
  entityId: z.string().nullable().optional(),
  tags: z.array(z.string()).min(1),
  confidence: z.number().min(0).max(1).optional(),
  isActive: z.boolean().optional(),
});
export type TagRuleData = z.infer<typeof TagRuleDataSchema>;

export const TagRuleUpdateSchema = z.object({
  entityId: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1).optional(),
  isActive: z.boolean().optional(),
});
export type TagRuleUpdate = z.infer<typeof TagRuleUpdateSchema>;

export const TagRuleChangeSetAddOpSchema = z.object({
  op: z.literal("add"),
  data: TagRuleDataSchema,
});

export const TagRuleChangeSetEditOpSchema = z.object({
  op: z.literal("edit"),
  id: z.string().min(1),
  data: TagRuleUpdateSchema,
});

export const TagRuleChangeSetDisableOpSchema = z.object({
  op: z.literal("disable"),
  id: z.string().min(1),
});

export const TagRuleChangeSetRemoveOpSchema = z.object({
  op: z.literal("remove"),
  id: z.string().min(1),
});

export const TagRuleChangeSetOpSchema = z.discriminatedUnion("op", [
  TagRuleChangeSetAddOpSchema,
  TagRuleChangeSetEditOpSchema,
  TagRuleChangeSetDisableOpSchema,
  TagRuleChangeSetRemoveOpSchema,
]);
export type TagRuleChangeSetOp = z.infer<typeof TagRuleChangeSetOpSchema>;

export const TagRuleChangeSetSchema = z.object({
  source: z.string().optional(),
  reason: z.string().optional(),
  ops: z.array(TagRuleChangeSetOpSchema).min(1),
});
export type TagRuleChangeSet = z.infer<typeof TagRuleChangeSetSchema>;

// ---------------------------------------------------------------------------
// Deterministic impact preview (suggestion-only diffs)
// ---------------------------------------------------------------------------

export type TagSuggestionSource = "tag_rule" | "rule" | "ai" | "entity";

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

export interface TagRuleChangeSetProposal {
  changeSet: TagRuleChangeSet;
  rationale: string;
  preview: {
    counts: TagRuleImpactCounts;
    affected: TagRuleImpactItem[];
  };
}
