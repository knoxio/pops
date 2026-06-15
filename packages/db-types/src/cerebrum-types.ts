/**
 * Drizzle `InferSelectModel<T>` / `InferInsertModel<T>` aliases for
 * cerebrum-owned tables.
 *
 * Split out of `index.ts` to keep that file under the file-size lint
 * cap once `@pops/db-types` re-exports the cerebrum schemas from
 * `@pops/cerebrum-db` (PRD-245 US-01). Public surface stays
 * unchanged: `index.ts` re-exports `* from './cerebrum-types.js'`.
 */
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import type {
  debriefResults,
  debriefSessions,
  debriefStatus,
  embeddings,
  engramIndex,
  engramLinks,
  engramScopes,
  engramTags,
  nudgeLog,
  reflexExecutions,
} from '@pops/cerebrum-db';

export type DebriefSessionRow = InferSelectModel<typeof debriefSessions>;
export type DebriefResultRow = InferSelectModel<typeof debriefResults>;
export type DebriefStatusRow = InferSelectModel<typeof debriefStatus>;
export type EmbeddingRow = InferSelectModel<typeof embeddings>;
export type EmbeddingInsert = InferInsertModel<typeof embeddings>;
export type EngramIndexRow = InferSelectModel<typeof engramIndex>;
export type EngramScopeRow = InferSelectModel<typeof engramScopes>;
export type EngramTagRow = InferSelectModel<typeof engramTags>;
export type EngramLinkRow = InferSelectModel<typeof engramLinks>;
export type NudgeLogRow = InferSelectModel<typeof nudgeLog>;
export type ReflexExecutionRow = InferSelectModel<typeof reflexExecutions>;
