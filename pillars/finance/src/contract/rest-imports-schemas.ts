/**
 * Zod schemas + inferred types for the `imports.*` sub-router.
 *
 * Split from `rest-imports.ts` so the route map there stays under the per-file
 * line cap. These are the single source of truth for the import wire shapes;
 * the CSV/PDF transformers are out of scope (the wire receives already-parsed
 * transactions via {@link ParsedTransactionSchema}).
 */
import { z } from 'zod';

import { ENTITY_TYPES, TRANSACTION_MATCH_TYPES } from '../db/index.js';
import { FX_CAPTURE_SOURCES } from './fx-capture.js';
import { CommitBatchSchema, ImportSourceSchema } from './import-source.js';
import { TransactionTypeSchema } from './rest-corrections-schemas.js';
import { ChangeSetSchema } from './rest-corrections.js';
import { RulesAppliedSchema, RuleWriteCountsSchema } from './rest-imports-rule-counts.js';
import { TagRuleChangeSetSchema } from './rest-tag-rules.js';

/** Transaction as parsed upstream (client-side or a transformer), with audit + dedup fields. */
export const ParsedTransactionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  description: z.string().min(1),
  amount: z.number(),
  dialectAccountLabel: z.string().min(1),
  /**
   * The `accounts.id` the wizard's account-step (POPS-2840) picked for this
   * import, distinct from `dialectAccountLabel` (the bank/dialect label
   * stamped at parse time — see `column-map/validation.ts`). Optional only
   * for a caller that predates the account-step; the commit path falls back
   * to name-matching `dialectAccountLabel` when it is absent (POPS-2852).
   */
  accountId: z.string().min(1).optional(),
  location: z.string().optional(),
  /** ISO-3166-1 alpha-2, set by parsers that can tell a charge was foreign. */
  country: z.string().optional(),
  /** Amount charged abroad, in `foreignCurrency`'s own ISO-4217 minor units. */
  foreignAmountMinor: z.number().int().optional(),
  /** ISO-4217 alpha-3 of the charge abroad, uppercase. */
  foreignCurrency: z
    .string()
    .regex(/^[A-Z]{3}$/, 'Currency must be an ISO-4217 alpha-3 code')
    .optional(),
  /** The issuer's foreign-transaction fee in AUD cents — a fee, not a converted total. */
  fxFeeCents: z.number().int().optional(),
  /**
   * Which capture path read this row's foreign charge (POPS-2647). Every parser
   * states one, including when the answer is that the format carries nothing;
   * absent only from a client that predates the field.
   */
  fxCaptureSource: z.enum(FX_CAPTURE_SOURCES).optional(),
  /**
   * The running balance printed on this row, in cents and UNSIGNED (POPS-2882).
   * Set only by a parser that reads one off the source file (currently the ANZ
   * PDF statement importer); ledger-signing it happens at commit, once the
   * account's `kind` is known.
   */
  balanceCents: z.number().int().optional(),
  /** The printed balance's own `CR`/`DR` suffix, when the source states one. */
  balanceMarker: z.enum(['CR', 'DR']).optional(),
  /**
   * The source says this row has not settled yet (an Up `HELD` card charge,
   * POPS-30). Stored on the row and cleared in place when the same row comes
   * back settled; absent means settled, since no file importer knows otherwise.
   */
  pending: z.boolean().optional(),
  rawRow: z.string(),
  checksum: z.string(),
});

export const EntityMatchSchema = z.object({
  entityId: z.string().optional(),
  entityName: z.string().optional(),
  matchType: z.enum(TRANSACTION_MATCH_TYPES),
  confidence: z.number().min(0).max(1).optional(),
});

export { TransactionTypeSchema };

export const SuggestedTagSchema = z.object({
  tag: z.string(),
  source: z.enum(['ai', 'rule', 'entity']),
  pattern: z.string().optional(),
  isNew: z.boolean().optional(),
});

export const RuleProvenanceSchema = z.object({
  source: z.literal('correction'),
  ruleId: z.string().min(1),
  pattern: z.string().min(1),
  matchType: z.enum(['exact', 'contains', 'regex']),
  // Audit-only (finance ADR-004/POPS-3130): `null` on a hand-written rule that was
  // never assessed — not a matching or routing signal either way.
  confidence: z.number().min(0).max(1).nullable(),
});

export const MatchedRuleSchema = z.object({
  ruleId: z.string().min(1),
  pattern: z.string().min(1),
  matchType: z.enum(['exact', 'contains', 'regex']),
  confidence: z.number().min(0).max(1).nullable(),
  priority: z.number(),
  entityId: z.string().nullable().optional(),
  entityName: z.string().nullable().optional(),
});

export const ProcessedTransactionSchema = ParsedTransactionSchema.extend({
  entity: EntityMatchSchema,
  status: z.enum(['matched', 'uncertain', 'failed', 'skipped']),
  skipReason: z.string().optional(),
  error: z.string().optional(),
  transactionType: TransactionTypeSchema.optional(),
  suggestedTags: z.array(SuggestedTagSchema).optional(),
  ruleProvenance: RuleProvenanceSchema.optional(),
  matchedRules: z.array(MatchedRuleSchema).optional(),
});

export const ConfirmedTransactionSchema = ParsedTransactionSchema.extend({
  transactionType: TransactionTypeSchema.optional(),
  entityId: z.string().optional(),
  entityName: z.string().optional(),
  tags: z.array(z.string()).optional(),
  suggestedTags: z.array(SuggestedTagSchema).optional(),
  /** How the entity assignment was produced (CF057/#3658), persisted verbatim at commit. */
  matchType: EntityMatchSchema.shape.matchType.optional(),
  /** Winning correction rule id, only set when `matchType` is `learned`. */
  matchRuleId: z.string().min(1).optional(),
  /** Match confidence (0-1), only set for `ai`/`learned` matches. */
  matchConfidence: z.number().min(0).max(1).optional(),
});

export const ImportWarningSchema = z.object({
  /**
   * `CHECKPOINT_MISMATCH` (POPS-2882): the checkpoint this commit minted from
   * the source file's own closing balance disagrees with what the ledger
   * predicted. Non-blocking — the import is right, the ledger is short — and
   * carries `details` naming expected, actual and delta.
   */
  type: z.enum(['AI_CATEGORIZATION_UNAVAILABLE', 'AI_API_ERROR', 'CHECKPOINT_MISMATCH']),
  message: z.string(),
  affectedCount: z.number().optional(),
  details: z.string().optional(),
});

export const AiUsageStatsSchema = z.object({
  apiCalls: z.number(),
  cacheHits: z.number(),
  totalInputTokens: z.number(),
  totalOutputTokens: z.number(),
  totalCostUsd: z.number(),
  avgCostPerCall: z.number(),
});

export const ProcessImportOutputSchema = z.object({
  matched: z.array(ProcessedTransactionSchema),
  uncertain: z.array(ProcessedTransactionSchema),
  failed: z.array(ProcessedTransactionSchema),
  skipped: z.array(ProcessedTransactionSchema),
  warnings: z.array(ImportWarningSchema).optional(),
  aiUsage: AiUsageStatsSchema.optional(),
});

export const ProcessImportInputSchema = z.object({
  transactions: z.array(ParsedTransactionSchema),
});

export const CreateEntityInputSchema = z.object({ name: z.string().min(1).max(200) });
export const CreateEntityOutputSchema = z.object({
  entityId: z.string(),
  entityName: z.string(),
});

export const ApplyChangeSetAndReevaluateInputSchema = z.object({
  sessionId: z.string().uuid(),
  changeSet: ChangeSetSchema,
});

export const ApplyChangeSetAndReevaluateOutputSchema = z.object({
  result: ProcessImportOutputSchema,
  affectedCount: z.number().int().nonnegative(),
});

export const PendingEntitySchema = z.object({
  tempId: z.string().regex(/^temp:entity:[0-9a-f-]{36}$/, 'Temp ID must match temp:entity:{uuid}'),
  name: z.string().min(1),
  type: z.enum(ENTITY_TYPES).default('company'),
});

/**
 * A tag-rule ChangeSet staged in the import wizard, carried to commit with the
 * new-vocabulary tags the user accepted alongside it.
 *
 * `acceptedNewTags` is the accept/decline outcome of the tag-rule dialog's
 * new-tags panel: when present, a *new* tag (one not already in the
 * vocabulary) the user unchecked is filtered out of the ChangeSet before it is
 * written at all, so it lands on neither `transaction_tag_rules` nor
 * `tag_vocabulary` (POPS-2643) — an already-known tag is never subject to this
 * gate and always stays. When absent — the batch rule-creation flow, which has
 * no accept/decline UI — every tag the ChangeSet carries is kept and, if new,
 * upserted (POPS-2597).
 */
export const CommitTagRuleChangeSetSchema = z.object({
  changeSet: TagRuleChangeSetSchema,
  acceptedNewTags: z.array(z.string()).optional(),
});

export const CommitPayloadSchema = z.object({
  entities: z.array(PendingEntitySchema).default([]),
  changeSets: z.array(ChangeSetSchema).default([]),
  tagRuleChangeSets: z.array(CommitTagRuleChangeSetSchema).default([]),
  transactions: z.array(ConfirmedTransactionSchema),
  /**
   * Client-generated idempotency key scoped to a single "Approve & Commit
   * All" click (#3640/#3642). Omitting it preserves the old at-most-once-
   * best-effort behaviour; supplying it makes a resubmit under the same key
   * a no-op replay of the first call's result instead of re-applying the
   * whole payload.
   */
  commitKey: z.string().uuid().optional(),
  source: ImportSourceSchema.optional(),
  /**
   * The pending draft this commit finishes (finance ADR-005). Deleted in the
   * same transaction that writes the rows, so a commit that fails leaves the
   * draft to be resumed and one that succeeds leaves no card behind.
   */
  draftId: z.string().optional(),
});

export { RulesAppliedSchema, RuleWriteCountsSchema };

export const FailedTransactionDetailSchema = z.object({
  checksum: z.string().nullable(),
  error: z.string(),
});

/**
 * A checkpoint minted from a source file's closing balance (POPS-2882). One
 * per account the commit touched, so `accountId` is what tells two apart.
 */
export const CommitCheckpointSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  /** The balance recorded, ledger-signed, minor units. */
  balanceCents: z.number().int(),
  /** The account's currency, so a summary line can format the balance without a second read. */
  currency: z.string(),
  /** The date it was recorded for: the statement's closing date, or the newest row a provider reported it with. */
  asOf: z.string(),
  /** `checkpoint.balanceCents - expectedBalanceCents`; zero means agreement. */
  deltaCents: z.number().int(),
});

export const CommitResultSchema = z.object({
  entitiesCreated: z.number().int().nonnegative(),
  rulesApplied: RulesAppliedSchema,
  tagRulesApplied: z.number().int().nonnegative(),
  /**
   * Of this commit's tag-rule `add` ops, how many minted a rule against how
   * many merged into one that already existed (POPS-2755). `tagRulesApplied`
   * stays the total across every op kind.
   *
   * Optional because a result recorded before this field existed is replayed
   * through this schema verbatim on a `commitKey` resubmit — a required field
   * would turn every historical commit's replay into a parse failure.
   */
  tagRuleWrites: RuleWriteCountsSchema.optional(),
  /**
   * Of this commit's correction-rule `add` ops, how many minted a rule
   * against how many merged into one that already existed (POPS-2954) —
   * `rulesApplied.add` stays the raw op count across both.
   *
   * Optional for the same replay reason as `tagRuleWrites`: a result recorded
   * before this field existed is replayed through this schema verbatim on a
   * `commitKey` resubmit.
   */
  correctionRuleWrites: RuleWriteCountsSchema.optional(),
  transactionsImported: z.number().int().nonnegative(),
  transactionsFailed: z.number().int().nonnegative(),
  failedDetails: z.array(FailedTransactionDetailSchema),
  retroactiveReclassifications: z.number().int().nonnegative(),
  /** Non-blocking commit-time findings — currently only `CHECKPOINT_MISMATCH`. */
  warnings: z.array(ImportWarningSchema).optional(),
  /**
   * The account checkpoints this commit minted from source-file closing
   * balances — one per account, since a single commit can span several once
   * a row is retargeted in review. Empty when the file carried no balance.
   *
   * Optional for the same reason `warnings` is: `import_commits.result` rows
   * are kept forever and replayed verbatim on a repeated `commitKey`, so a
   * result recorded before this field existed must still parse. Absent means
   * "recorded before checkpoints were minted", not "minted none" — a fresh
   * commit always sends the array.
   */
  checkpoints: z.array(CommitCheckpointSchema).optional(),
  batches: z.array(CommitBatchSchema).optional(),
});

export const ReevaluateWithPendingRulesInputSchema = z.object({
  sessionId: z.string().uuid(),
  pendingChangeSets: z.array(z.object({ changeSet: ChangeSetSchema })),
});

export type ParsedTransaction = z.infer<typeof ParsedTransactionSchema>;
export type EntityMatch = z.infer<typeof EntityMatchSchema>;
export type TransactionType = z.infer<typeof TransactionTypeSchema>;
export type SuggestedTag = z.infer<typeof SuggestedTagSchema>;
export type RuleProvenance = z.infer<typeof RuleProvenanceSchema>;
export type MatchedRule = z.infer<typeof MatchedRuleSchema>;
export type ProcessedTransaction = z.infer<typeof ProcessedTransactionSchema>;
export type ConfirmedTransaction = z.infer<typeof ConfirmedTransactionSchema>;
export type ImportWarning = z.infer<typeof ImportWarningSchema>;
export type AiUsageStats = z.infer<typeof AiUsageStatsSchema>;
export type ProcessImportOutput = z.infer<typeof ProcessImportOutputSchema>;
export type CreateEntityOutput = z.infer<typeof CreateEntityOutputSchema>;
export type PendingEntity = z.infer<typeof PendingEntitySchema>;
export type CommitTagRuleChangeSet = z.infer<typeof CommitTagRuleChangeSetSchema>;
export type CommitPayload = z.infer<typeof CommitPayloadSchema>;
export type CommitResult = z.infer<typeof CommitResultSchema>;
export type CommitCheckpoint = z.infer<typeof CommitCheckpointSchema>;
export type FailedTransactionDetail = z.infer<typeof FailedTransactionDetailSchema>;
