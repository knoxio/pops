import { and, eq } from 'drizzle-orm';

import { embeddings } from '@pops/db-types';

import { getDb, getDrizzle } from '../../db.js';

export async function fetchContent(sourceType: string, sourceId: string): Promise<string | null> {
  const db = getDb();

  switch (sourceType) {
    case 'transactions': {
      const row = db
        .prepare('SELECT description, notes FROM transactions WHERE id = ?')
        .get(sourceId) as { description: string; notes: string | null } | undefined;
      if (!row) return null;
      return [row.description, row.notes].filter(Boolean).join('\n');
    }

    default:
      return null;
  }
}

export async function deleteEmbeddingsForSource(
  sourceType: string,
  sourceId: string
): Promise<void> {
  const db = getDrizzle();
  const rawDb = getDb();

  const rows = db
    .select({ id: embeddings.id })
    .from(embeddings)
    .where(and(eq(embeddings.sourceType, sourceType), eq(embeddings.sourceId, sourceId)))
    .all();

  for (const row of rows) {
    rawDb.prepare('DELETE FROM embeddings_vec WHERE rowid = ?').run(row.id);
  }

  db.delete(embeddings)
    .where(and(eq(embeddings.sourceType, sourceType), eq(embeddings.sourceId, sourceId)))
    .run();
}
