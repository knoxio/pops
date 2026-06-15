/**
 * Public `Row`/`Insert` aliases for the cerebrum-owned tables.
 *
 * Centralised here so consumers can `import type { EmbeddingRow } from
 * '@pops/cerebrum-db'` without reaching into a service module. The
 * underlying tables live in `./schema/*.ts` (PRD-245 US-01).
 *
 * Service-owned types (`NudgeLogRow`, glia-types, plexus-types, engrams
 * `IndexRow`, conversation-types) live in their respective service
 * modules and are re-exported from `./index.ts`; this file hosts the
 * remaining inferred row aliases relocated from `@pops/db-types`.
 */
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import type {
  debriefResults,
  debriefSessions,
  debriefStatus,
  embeddings,
  engramLinks,
  engramScopes,
  engramTags,
  nudgeLog,
  reflexExecutions,
} from './schema.js';

export type DebriefSessionRow = InferSelectModel<typeof debriefSessions>;
export type DebriefSessionInsert = InferInsertModel<typeof debriefSessions>;

export type DebriefResultRow = InferSelectModel<typeof debriefResults>;
export type DebriefResultInsert = InferInsertModel<typeof debriefResults>;

export type DebriefStatusRow = InferSelectModel<typeof debriefStatus>;
export type DebriefStatusInsert = InferInsertModel<typeof debriefStatus>;

export type EmbeddingRow = InferSelectModel<typeof embeddings>;
export type EmbeddingInsert = InferInsertModel<typeof embeddings>;

export type EngramScopeRow = InferSelectModel<typeof engramScopes>;
export type EngramScopeInsert = InferInsertModel<typeof engramScopes>;

export type EngramTagRow = InferSelectModel<typeof engramTags>;
export type EngramTagInsert = InferInsertModel<typeof engramTags>;

export type EngramLinkRow = InferSelectModel<typeof engramLinks>;
export type EngramLinkInsert = InferInsertModel<typeof engramLinks>;

export type NudgeLogInsert = InferInsertModel<typeof nudgeLog>;

export type ReflexExecutionRow = InferSelectModel<typeof reflexExecutions>;
export type ReflexExecutionInsert = InferInsertModel<typeof reflexExecutions>;
