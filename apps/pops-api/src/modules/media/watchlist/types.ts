import type { MediaWatchlistRow } from '@pops/db-types';
import { MEDIA_TYPES } from '@pops/db-types';
import { z } from 'zod';

export type { MediaWatchlistRow };

/** API response shape for a watchlist entry. */
export interface WatchlistEntry {
  id: number;
  mediaType: string;
  mediaId: number;
  priority: number | null;
  notes: string | null;
  source: string | null;
  plexRatingKey: string | null;
  addedAt: string;
  title: string | null;
  posterUrl: string | null;
}

/** Enriched row from the service (includes joined title/poster). */
export interface EnrichedWatchlistRow extends MediaWatchlistRow {
  title: string | null;
  posterUrl: string | null;
}

/** Map a row to the API response shape. Accepts both plain and enriched rows. */
export function toWatchlistEntry(
  row: MediaWatchlistRow & { title?: string | null; posterUrl?: string | null }
): WatchlistEntry {
  return {
    id: row.id,
    mediaType: row.mediaType,
    mediaId: row.mediaId,
    priority: row.priority,
    notes: row.notes,
    source: row.source,
    plexRatingKey: row.plexRatingKey,
    addedAt: row.addedAt,
    title: row.title ?? null,
    posterUrl: row.posterUrl ?? null,
  };
}

/** Zod schema for adding to the watchlist. */
export const AddToWatchlistSchema = z.object({
  mediaType: z.enum(MEDIA_TYPES),
  mediaId: z.number().int().positive(),
  priority: z.number().int().nonnegative().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type AddToWatchlistInput = z.infer<typeof AddToWatchlistSchema>;

/** Zod schema for updating a watchlist entry. */
export const UpdateWatchlistSchema = z.object({
  priority: z.number().int().nonnegative().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type UpdateWatchlistInput = z.infer<typeof UpdateWatchlistSchema>;

/** Zod schema for watchlist list query params. */
export const WatchlistQuerySchema = z.object({
  mediaType: z.enum(MEDIA_TYPES).optional(),
  limit: z.coerce.number().positive().max(500).optional(),
  offset: z.coerce.number().nonnegative().optional(),
});
export type WatchlistQueryRaw = z.infer<typeof WatchlistQuerySchema>;

/** Parsed filter params passed to the service layer. */
export interface WatchlistFilters {
  mediaType?: string;
}
