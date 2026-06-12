/**
 * Core-embedding inferred types.
 *
 * Re-exported from `./index.ts` for ergonomic consumer imports. Lives
 * in a sub-module to keep `index.ts` under the 200-line max-lines cap
 * as more domains accrete.
 */
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import type { embeddings } from './schema/core/embeddings.js';

export type EmbeddingRow = InferSelectModel<typeof embeddings>;
export type EmbeddingInsert = InferInsertModel<typeof embeddings>;
