import { type QualityBand, type QualitySignal, type CompileStatus } from '../../inbox/quality.js';

import type { PartialReason } from '../../contract/queue/index.js';
/**
 * Shared types + the cursor codec for the Drafts inbox tab. Imported by both
 * `inbox-queries-drafts.ts` (the entry point) and
 * `inbox-queries-drafts-helpers.ts` (the in-memory score + sort + paginate
 * pipeline).
 */
import type { IngestSourceKind } from '../schema.js';

export type DraftSort = 'quality-asc' | 'quality-desc' | 'oldest' | 'newest';

export interface InboxDraftRow {
  sourceId: number;
  versionId: number;
  recipeSlug: string;
  title: string | null;
  recipeType:
    | 'plate'
    | 'component'
    | 'technique'
    | 'sauce'
    | 'dressing'
    | 'drink'
    | 'condiment'
    | null;
  ingestKind: IngestSourceKind;
  sourceUrl: string | null;
  ingestedAt: string;
  qualityBand: QualityBand;
  qualityScore: number;
  topSignals: QualitySignal[];
  partialReason?: PartialReason;
  proposedSlugCount: number;
  creationCount: number;
  compileStatus: CompileStatus;
}

export interface DraftsCursor {
  score: number;
  ingestedAt: string;
  versionId: number;
}

export interface ListDraftsFilter {
  bands?: QualityBand[];
  kinds?: IngestSourceKind[];
  partialReasons?: PartialReason[];
  freshOnly?: boolean;
  sort?: DraftSort;
  cursor?: DraftsCursor | null;
  limit: number;
}

const CURSOR_SEP = '|';

export function encodeDraftsCursor(cursor: DraftsCursor): string {
  const raw = `${cursor.score}${CURSOR_SEP}${cursor.ingestedAt}${CURSOR_SEP}${cursor.versionId}`;
  return Buffer.from(raw, 'utf8').toString('base64url');
}

export function decodeDraftsCursor(cursor: string): DraftsCursor | null {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const parts = decoded.split(CURSOR_SEP);
    if (parts.length !== 3) return null;
    const [scoreStr, ingestedAt, idStr] = parts;
    if (scoreStr === undefined || ingestedAt === undefined || idStr === undefined) return null;
    const score = Number(scoreStr);
    const versionId = Number(idStr);
    if (!Number.isFinite(score) || !Number.isInteger(versionId) || versionId <= 0) return null;
    if (ingestedAt.length === 0) return null;
    return { score, ingestedAt, versionId };
  } catch {
    return null;
  }
}
