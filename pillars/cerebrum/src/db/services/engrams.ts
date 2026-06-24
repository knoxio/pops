/**
 * Engram data-access for the cerebrum pillar (engram-file-format).
 *
 * Scope boundary: this file is the SQL seam for the engrams slice. It
 * covers find / upsert / delete on `engram_index` and its three
 * many-to-many auxiliaries (`engram_scopes`, `engram_tags`,
 * `engram_links`), plus link insert/delete edges and the cross-table
 * detector helper `loadActiveEngrams`. The list/hydrate pair lives in
 * `engrams-list.ts` (kept separate to stay under the per-file line
 * ceiling). Anything that touches the filesystem (parsing Markdown,
 * writing files atomically, renaming on type change), the template
 * registry, or the scope-rule engine lives in the pillar's engrams
 * module — this stays pure data-access (no node:fs, no zod
 * cross-validation, no domain orchestration).
 *
 * Functions take a `CerebrumDb` handle as their first argument; the
 * caller resolves the singleton or transaction handle. Mirrors the
 * `nudge-log.ts` db-arg pattern in this slice.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';

import { engramIndex, engramLinks, engramScopes, engramTags } from '../schema.js';
import { bucket, dedupe, indexRowFromDrizzle, parseCustomFields } from './engrams-helpers.js';
import { hydrateEngrams, listEngrams } from './engrams-list.js';

import type { Engram, EngramSummary, IndexRow, UpsertEngramArgs } from './engrams-types.js';
import type { CerebrumDb } from './internal.js';

export { hydrateEngrams, listEngrams };
export { parseCustomFields };

export function findIndexRow(db: CerebrumDb, id: string): IndexRow | null {
  const [row] = db.select().from(engramIndex).where(eq(engramIndex.id, id)).all();
  return row ? indexRowFromDrizzle(row) : null;
}

export function existsEngram(db: CerebrumDb, id: string): boolean {
  return findIndexRow(db, id) !== null;
}

/**
 * Find the id of an active engram whose body hash matches `bodyHash`, if any.
 * Powers ingest deduplication — a re-submission of identical normalised
 * content resolves to the existing engram instead of writing a duplicate.
 */
export function findActiveIdByBodyHash(db: CerebrumDb, bodyHash: string): string | null {
  const [row] = db
    .select({ id: engramIndex.id })
    .from(engramIndex)
    .where(and(eq(engramIndex.bodyHash, bodyHash), eq(engramIndex.status, 'active')))
    .all();
  return row?.id ?? null;
}

/**
 * Replace the `engram_index` row and re-seed its scopes/tags/links from
 * the supplied arrays. Runs in a single transaction so a concurrent reader
 * never observes a half-replaced row + stale auxiliaries.
 *
 * The cascade on `engram_index.id` handles the auxiliary deletes; we then
 * re-insert the deduplicated new sets. Caller is expected to have already
 * normalised `customFields` to the JSON-storable shape.
 */
export function upsertEngramIndex(db: CerebrumDb, args: UpsertEngramArgs): void {
  const customFieldsBlob =
    Object.keys(args.customFields).length > 0 ? JSON.stringify(args.customFields) : null;

  db.transaction((tx) => {
    tx.delete(engramIndex).where(eq(engramIndex.id, args.id)).run();
    tx.insert(engramIndex)
      .values({
        id: args.id,
        filePath: args.filePath,
        type: args.type,
        source: args.source,
        status: args.status,
        template: args.template,
        createdAt: args.createdAt,
        modifiedAt: args.modifiedAt,
        title: args.title,
        contentHash: args.contentHash,
        bodyHash: args.bodyHash,
        wordCount: args.wordCount,
        customFields: customFieldsBlob,
      })
      .run();

    const scopes = dedupe(args.scopes);
    if (scopes.length > 0) {
      tx.insert(engramScopes)
        .values(scopes.map((scope) => ({ engramId: args.id, scope })))
        .run();
    }
    const tags = dedupe(args.tags);
    if (tags.length > 0) {
      tx.insert(engramTags)
        .values(tags.map((tag) => ({ engramId: args.id, tag })))
        .run();
    }
    const links = dedupe(args.links);
    if (links.length > 0) {
      tx.insert(engramLinks)
        .values(links.map((targetId) => ({ sourceId: args.id, targetId })))
        .run();
    }
  });
}

/**
 * Hard-delete an `engram_index` row. The FK cascades wipe scopes, tags,
 * and outbound links. Inbound `engram_links` rows (other engrams that
 * reference this id as their target) are NOT cascaded — those carry no
 * FK by design (frontmatter may reference a target that has not been
 * indexed yet), so we sweep them explicitly here.
 *
 * Returns the number of `engram_index` rows actually deleted (0 if `id`
 * was already gone — caller can treat this as an idempotent op).
 */
export function deleteEngramIndex(db: CerebrumDb, id: string): number {
  return db.transaction((tx) => {
    const result = tx.delete(engramIndex).where(eq(engramIndex.id, id)).run();
    tx.delete(engramLinks).where(eq(engramLinks.targetId, id)).run();
    return result.changes;
  });
}

/**
 * Look up an engram by id and hydrate it. Returns null if the row is gone
 * — leaving the not-found policy (throw vs return) to the caller so this
 * layer stays decoupled from any HTTP error types.
 */
export function getEngram(db: CerebrumDb, id: string): Engram | null {
  const row = findIndexRow(db, id);
  if (!row) return null;
  const [hydrated] = hydrateEngrams(db, [row]);
  return hydrated ?? null;
}

/**
 * Insert a single (sourceId, targetId) edge. Idempotent via
 * `onConflictDoNothing` against the `uq_engram_links_pair` unique index.
 * Reverse-edge bookkeeping (insert (targetId, sourceId) too) and any
 * frontmatter file mutation are the caller's responsibility.
 */
export function insertEngramLink(db: CerebrumDb, sourceId: string, targetId: string): void {
  db.insert(engramLinks).values({ sourceId, targetId }).onConflictDoNothing().run();
}

/** Delete every (a, b) and (b, a) pair between the two engrams. */
export function deleteEngramLinkPair(db: CerebrumDb, a: string, b: string): void {
  db.delete(engramLinks)
    .where(
      sql`(${engramLinks.sourceId} = ${a} AND ${engramLinks.targetId} = ${b}) OR (${engramLinks.sourceId} = ${b} AND ${engramLinks.targetId} = ${a})`
    )
    .run();
}

/**
 * Active engrams snapshot for detector-style scans (proactive nudges,
 * glia workers, etc.). Filters out archived/consolidated rows server-side
 * and hydrates scopes + tags in two range queries.
 */
export function loadActiveEngrams(db: CerebrumDb): EngramSummary[] {
  const rows = db
    .select()
    .from(engramIndex)
    .where(sql`${engramIndex.status} NOT IN ('archived', 'consolidated')`)
    .all();
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const scopeMap = bucket(
    db
      .select({ engramId: engramScopes.engramId, value: engramScopes.scope })
      .from(engramScopes)
      .where(inArray(engramScopes.engramId, ids))
      .all()
  );
  const tagMap = bucket(
    db
      .select({ engramId: engramTags.engramId, value: engramTags.tag })
      .from(engramTags)
      .where(inArray(engramTags.engramId, ids))
      .all()
  );

  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    status: r.status,
    scopes: scopeMap.get(r.id) ?? [],
    tags: tagMap.get(r.id) ?? [],
    createdAt: r.createdAt,
    modifiedAt: r.modifiedAt,
  }));
}
