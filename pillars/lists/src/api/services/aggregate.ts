/**
 * Router-owned aggregate query for `lists.list.list` — PRD-140.
 *
 * The PRD calls out that this is intentionally bypassed by PRD-112's
 * `listLists` service (which only returns header rows). The index page needs
 * `itemCount` / `uncheckedCount` / `lastUpdatedAt` in a single round-trip so
 * a left join + GROUP BY is the right tool, even though it's a router-level
 * concern rather than a domain-service one.
 *
 * `lastUpdatedAt = MAX(MAX(list_items.created_at), lists.created_at)` —
 * picks up "I added an item yesterday" without introducing a separate
 * `lists.updated_at` column the schema doesn't have.
 */
import { sql, type SQL } from 'drizzle-orm';

import { type ListKind, type ListsDb } from '../../db/index.js';

export interface ListAggregateRow {
  id: number;
  name: string;
  kind: ListKind;
  ownerApp: string;
  itemCount: number;
  uncheckedCount: number;
  lastUpdatedAt: string;
  archivedAt: string | null;
}

export type AggregateSort = 'updated' | 'name' | 'created';

export interface AggregateFilter {
  kinds?: readonly ListKind[];
  includeArchived?: boolean;
  sort?: AggregateSort;
}

function orderClause(sort: AggregateSort): SQL {
  if (sort === 'name') return sql`l.name COLLATE NOCASE ASC`;
  if (sort === 'created') return sql`l.created_at DESC`;
  // 'updated' (default) — uses the same aggregate as the SELECT alias.
  // SQLite forbids wrapping an aggregate again in ORDER BY, so this mirrors
  // the projection's `MAX(li.created_at)` without an outer MAX.
  return sql`COALESCE(MAX(li.created_at), l.created_at) DESC`;
}

interface RawRow {
  id: number;
  name: string;
  kind: ListKind;
  owner_app: string;
  archived_at: string | null;
  item_count: number;
  // SQLite's SUM(...) returns NULL when no rows match (the LEFT JOIN leaves
  // a single row with all-null `li.*` columns). The mapping below normalises
  // it to 0, but the wire-shape type must reflect the raw query result.
  unchecked_count: number | null;
  last_updated_at: string;
}

export function selectListAggregate(
  db: ListsDb,
  filter: AggregateFilter = {}
): readonly ListAggregateRow[] {
  const includeArchived = filter.includeArchived === true;
  const kinds = filter.kinds === undefined || filter.kinds.length === 0 ? null : filter.kinds;
  const sort: AggregateSort = filter.sort ?? 'updated';

  const archiveClause = includeArchived ? sql`TRUE` : sql`l.archived_at IS NULL`;
  const kindClause =
    kinds === null
      ? sql`TRUE`
      : sql`l.kind IN (${sql.join(
          kinds.map((k) => sql`${k}`),
          sql`, `
        )})`;

  const order = orderClause(sort);

  // GROUP BY every non-aggregated column we project — SQLite is permissive
  // but being explicit keeps `strict: true` mode happy and prevents drift if
  // a column is added later.
  const query = sql`
    SELECT
      l.id AS id,
      l.name AS name,
      l.kind AS kind,
      l.owner_app AS owner_app,
      l.archived_at AS archived_at,
      COUNT(li.id) AS item_count,
      SUM(CASE WHEN li.id IS NOT NULL AND li.checked = 0 THEN 1 ELSE 0 END) AS unchecked_count,
      COALESCE(MAX(li.created_at), l.created_at) AS last_updated_at
    FROM lists l
    LEFT JOIN list_items li ON li.list_id = l.id
    WHERE ${archiveClause} AND ${kindClause}
    GROUP BY l.id, l.name, l.kind, l.owner_app, l.archived_at, l.created_at
    ORDER BY ${order}
  `;

  const rows = db.all(query) as readonly RawRow[];

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    ownerApp: r.owner_app,
    archivedAt: r.archived_at,
    itemCount: r.item_count,
    uncheckedCount: r.unchecked_count ?? 0,
    lastUpdatedAt: r.last_updated_at,
  }));
}
