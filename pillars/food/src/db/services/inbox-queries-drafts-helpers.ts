import { type CompileStatus, scoreDraft } from '../../inbox/quality.js';
import {
  type DraftSort,
  type DraftsCursor,
  type InboxDraftRow,
  type ListDraftsFilter,
  encodeDraftsCursor,
} from './inbox-queries-drafts-types.js';

/**
 * In-memory score, filter, sort, and paginate pipeline for the Drafts
 * inbox tab.
 *
 * Scoring + filtering happen in memory because the heuristic band is not a
 * column — it's derived per row from `scoreDraft`. SQL narrows by `kind`
 * (and the always-on pending-draft predicate); the rest lives here.
 *
 * `partialReason` lives in `ingest_sources.extracted_json` so the SQL side
 * can't push the predicate down without a JSON1 extract; the in-memory
 * filter is the simpler shape.
 *
 * Pagination cursor encodes `(score, ingestedAt, versionId)` so identical
 * scores break by recency and identical `(score, ingestedAt)` break by
 * versionId. Tie-break direction matches the sort: `oldest` breaks ties
 * by versionId ASC (oldest version-id first within a same-instant batch);
 * the other three orders break ties by versionId DESC (newest first).
 * Same cursor shape across every sort order; the sort key just changes
 * which field drives the primary compare.
 */
import type { gatherQualityInputsForVersions } from '../../inbox/gather-quality-inputs.js';
import type { IngestSourceKind } from '../schema.js';
import type { ListPage } from './inbox-queries-shared.js';

const FRESH_MAX_AGE_MINUTES = 1440;

export interface JoinedDraftRow {
  versionId: number;
  recipeSlug: string;
  sourceId: number;
  title: string;
  recipeType: InboxDraftRow['recipeType'];
  ingestKind: IngestSourceKind;
  sourceUrl: string | null;
  ingestedAt: string;
  compileStatus: CompileStatus;
}

interface ScoredRow extends InboxDraftRow {
  /** Kept on the row so the cursor encoder can read it without re-derive. */
  cursorScore: number;
}

export function scoreAndFilter(
  joined: readonly JoinedDraftRow[],
  inputs: ReturnType<typeof gatherQualityInputsForVersions>,
  filter: ListDraftsFilter
): ScoredRow[] {
  const out: ScoredRow[] = [];
  for (const r of joined) {
    const qi = inputs.get(r.versionId);
    if (qi === undefined) continue;
    const result = scoreDraft(qi);
    if (!passesFilters(result.band, qi, filter)) continue;
    out.push(buildScoredRow(r, qi, result));
  }
  return out;
}

function passesFilters(
  band: ReturnType<typeof scoreDraft>['band'],
  qi: NonNullable<ReturnType<ReturnType<typeof gatherQualityInputsForVersions>['get']>>,
  filter: ListDraftsFilter
): boolean {
  // Treat a present array as the explicit allowed set — including the empty
  // one. The UI can reach `bands: []` by toggling every chip off; an empty
  // array means "no band matches", not "no filter applied". Same shape for
  // `partialReasons`.
  if (Array.isArray(filter.bands) && !filter.bands.includes(band)) return false;
  if (Array.isArray(filter.partialReasons)) {
    if (qi.partialReason === undefined) return false;
    if (!filter.partialReasons.includes(qi.partialReason)) return false;
  }
  if (filter.freshOnly === true && qi.ingestAgeMinutes >= FRESH_MAX_AGE_MINUTES) return false;
  return true;
}

function buildScoredRow(
  r: JoinedDraftRow,
  qi: NonNullable<ReturnType<ReturnType<typeof gatherQualityInputsForVersions>['get']>>,
  result: ReturnType<typeof scoreDraft>
): ScoredRow {
  return {
    sourceId: r.sourceId,
    versionId: r.versionId,
    recipeSlug: r.recipeSlug,
    title: r.title.trim().length === 0 ? null : r.title,
    recipeType: r.recipeType,
    ingestKind: r.ingestKind,
    sourceUrl: r.sourceUrl,
    ingestedAt: r.ingestedAt,
    qualityBand: result.band,
    qualityScore: result.score,
    topSignals: result.signals.slice(0, 3),
    partialReason: qi.partialReason,
    proposedSlugCount: qi.proposedSlugCount,
    creationCount: qi.creationCount,
    compileStatus: qi.compileStatus,
    cursorScore: result.score,
  };
}

export function paginate(rows: ScoredRow[], filter: ListDraftsFilter): ListPage<InboxDraftRow> {
  const sort = filter.sort ?? 'quality-asc';
  const sorted = rows.toSorted((a, b) => compareRows(a, b, sort));
  const startIndex = findCursorIndex(sorted, filter.cursor, sort);
  const page = sorted.slice(startIndex, startIndex + filter.limit + 1);
  const trimmed = page.slice(0, filter.limit);
  const items = trimmed.map(stripCursorScore);
  const last = trimmed[trimmed.length - 1];
  const nextCursor = buildNextCursor(page.length, filter.limit, last);
  return { items, nextCursor };
}

function buildNextCursor(
  pageLength: number,
  limit: number,
  last: ScoredRow | undefined
): string | null {
  if (pageLength <= limit) return null;
  if (last === undefined) return null;
  return encodeDraftsCursor({
    score: last.cursorScore,
    ingestedAt: last.ingestedAt,
    versionId: last.versionId,
  });
}

function compareRows(a: ScoredRow, b: ScoredRow, sort: DraftSort): number {
  if (sort === 'oldest') {
    return cmpStr(a.ingestedAt, b.ingestedAt) || cmpNum(a.versionId, b.versionId);
  }
  if (sort === 'newest') {
    return cmpStrDesc(a.ingestedAt, b.ingestedAt) || cmpNumDesc(a.versionId, b.versionId);
  }
  const scorePrimary =
    sort === 'quality-asc'
      ? cmpNum(a.qualityScore, b.qualityScore)
      : cmpNumDesc(a.qualityScore, b.qualityScore);
  return (
    scorePrimary || cmpStrDesc(a.ingestedAt, b.ingestedAt) || cmpNumDesc(a.versionId, b.versionId)
  );
}

function cmpNum(a: number, b: number): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
function cmpNumDesc(a: number, b: number): number {
  return cmpNum(b, a);
}
function cmpStr(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
function cmpStrDesc(a: string, b: string): number {
  return cmpStr(b, a);
}

function findCursorIndex(
  sorted: readonly ScoredRow[],
  cursor: DraftsCursor | null | undefined,
  sort: DraftSort
): number {
  if (cursor === null || cursor === undefined) return 0;
  // The cursor marks the LAST row of the previous page. We want the first
  // row strictly after it in the active sort order.
  const sentinel = makeCursorSentinel(cursor);
  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i];
    if (row === undefined) continue;
    if (compareRows(row, sentinel, sort) > 0) return i;
  }
  return sorted.length;
}

function makeCursorSentinel(cursor: DraftsCursor): ScoredRow {
  return {
    sourceId: -1,
    versionId: cursor.versionId,
    recipeSlug: '',
    title: null,
    recipeType: null,
    ingestKind: 'url-web',
    sourceUrl: null,
    ingestedAt: cursor.ingestedAt,
    qualityBand: 'clean',
    qualityScore: cursor.score,
    topSignals: [],
    proposedSlugCount: 0,
    creationCount: 0,
    compileStatus: 'compiled',
    cursorScore: cursor.score,
  };
}

function stripCursorScore(row: ScoredRow): InboxDraftRow {
  const { cursorScore: _cursorScore, ...rest } = row;
  void _cursorScore;
  return rest;
}
