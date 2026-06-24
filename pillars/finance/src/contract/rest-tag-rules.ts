/**
 * `tagRules.*` sub-router — the tag-suggestion rule surface (vocabulary +
 * ChangeSet propose/preview/apply/reject). The `transaction_tag_rules` +
 * `tag_vocabulary` tables live in the finance db. The propose/preview
 * computations are deterministic (no AI) and operate on caller-supplied
 * transactions, so the domain has no cross-pillar coupling.
 *
 * propose/preview are `POST`: a GET cannot carry the transactions array.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ERR_RESPONSES } from './rest-schemas.js';

const c = initContract();

const MatchTypeSchema = z.enum(['exact', 'contains', 'regex']);

const TagRuleDataSchema = z.object({
  descriptionPattern: z.string().min(1),
  matchType: MatchTypeSchema.default('exact'),
  entityId: z.string().nullable().optional(),
  tags: z.array(z.string()).min(1),
  confidence: z.number().min(0).max(1).optional(),
  isActive: z.boolean().optional(),
  priority: z.number().int().nonnegative().optional(),
});

const TagRuleUpdateSchema = z.object({
  entityId: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1).optional(),
  isActive: z.boolean().optional(),
  priority: z.number().int().nonnegative().optional(),
});

export const TagRuleChangeSetOpSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('add'), data: TagRuleDataSchema }),
  z.object({ op: z.literal('edit'), id: z.string().min(1), data: TagRuleUpdateSchema }),
  z.object({ op: z.literal('disable'), id: z.string().min(1) }),
  z.object({ op: z.literal('remove'), id: z.string().min(1) }),
]);

export const TagRuleChangeSetSchema = z.object({
  source: z.string().optional(),
  reason: z.string().optional(),
  ops: z.array(TagRuleChangeSetOpSchema).min(1),
});

export type TagRuleChangeSetOp = z.infer<typeof TagRuleChangeSetOpSchema>;
export type TagRuleChangeSet = z.infer<typeof TagRuleChangeSetSchema>;

const TagRuleSignalSchema = z.object({
  descriptionPattern: z.string().min(1),
  matchType: MatchTypeSchema,
  entityId: z.string().nullable().optional(),
  tags: z.array(z.string()).min(1),
});

const PreviewInputTransactionSchema = z.object({
  transactionId: z.string().min(1),
  description: z.string().min(1),
  entityId: z.string().nullable().optional(),
  userTags: z.array(z.string()).optional(),
});

const TagSuggestionSchema = z.object({
  tag: z.string(),
  source: z.enum(['tag_rule', 'rule', 'ai', 'entity']),
  pattern: z.string().optional(),
  isNew: z.boolean().optional(),
});

const TagRuleSuggestionOutcomeSchema = z.object({ suggestedTags: z.array(TagSuggestionSchema) });

const TagRuleImpactItemSchema = z.object({
  transactionId: z.string(),
  description: z.string(),
  before: TagRuleSuggestionOutcomeSchema,
  after: TagRuleSuggestionOutcomeSchema,
});

/** One transaction's before/after tag-suggestion outcome in a tag-rule preview. */
export type TagRuleImpactItem = z.infer<typeof TagRuleImpactItemSchema>;

const TagRuleImpactCountsSchema = z.object({
  affected: z.number(),
  suggestionChanges: z.number(),
  newTagProposals: z.number(),
});

const TagRulePreviewSchema = z.object({
  counts: TagRuleImpactCountsSchema,
  affected: z.array(TagRuleImpactItemSchema),
});

const TagRuleChangeSetProposalSchema = z.object({
  changeSet: TagRuleChangeSetSchema,
  rationale: z.string(),
  preview: TagRulePreviewSchema,
});

/** Persisted rule row, with `tags` parsed to a `string[]` (column is JSON). */
export const TagRuleSchema = z.object({
  id: z.string(),
  descriptionPattern: z.string(),
  matchType: MatchTypeSchema,
  entityId: z.string().nullable(),
  tags: z.array(z.string()),
  isActive: z.boolean(),
  confidence: z.number(),
  priority: z.number(),
  timesApplied: z.number(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
});

const MaxPreviewItems = z.coerce.number().int().positive().max(500).default(200);

export const financeTagRulesContract = c.router({
  vocabulary: {
    method: 'GET',
    path: '/tag-rules/vocabulary',
    responses: { 200: z.object({ tags: z.array(z.string()) }) },
    summary: 'List the user tag vocabulary',
  },
  propose: {
    method: 'POST',
    path: '/tag-rules/propose',
    body: z.object({
      signal: TagRuleSignalSchema,
      transactions: z.array(PreviewInputTransactionSchema).default([]),
      maxPreviewItems: MaxPreviewItems,
    }),
    responses: { 200: TagRuleChangeSetProposalSchema, ...ERR_RESPONSES },
    summary:
      'Propose a tag-rule ChangeSet from a tag-edit signal (deterministic, with impact preview)',
  },
  preview: {
    method: 'POST',
    path: '/tag-rules/preview',
    body: z.object({
      changeSet: TagRuleChangeSetSchema,
      transactions: z.array(PreviewInputTransactionSchema),
      maxPreviewItems: MaxPreviewItems,
    }),
    responses: { 200: TagRulePreviewSchema, ...ERR_RESPONSES },
    summary: 'Preview the suggestion-impact of a tag-rule ChangeSet over the supplied transactions',
  },
  apply: {
    method: 'POST',
    path: '/tag-rules/apply',
    body: z.object({
      changeSet: TagRuleChangeSetSchema,
      acceptedNewTags: z.array(z.string()).default([]),
    }),
    responses: { 200: z.object({ rules: z.array(TagRuleSchema) }), ...ERR_RESPONSES },
    summary: 'Apply a tag-rule ChangeSet; upserts accepted new vocabulary tags',
  },
  reject: {
    method: 'POST',
    path: '/tag-rules/reject',
    body: z.object({
      changeSet: TagRuleChangeSetSchema,
      feedback: z.string().min(1),
      signal: TagRuleSignalSchema.optional(),
      transactions: z.array(PreviewInputTransactionSchema).optional(),
      maxPreviewItems: MaxPreviewItems,
    }),
    responses: {
      200: z.object({
        message: z.string(),
        followUpProposal: TagRuleChangeSetProposalSchema.nullable(),
      }),
      ...ERR_RESPONSES,
    },
    summary: 'Reject a ChangeSet with feedback; optionally returns a revised follow-up proposal',
  },
});
