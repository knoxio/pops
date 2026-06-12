/**
 * Zod contract schemas + DTO shapes for the watchlist router.
 *
 * Mirrors the wire contract the legacy `apps/pops-api/src/modules/media/watchlist`
 * router serves so the dispatcher cutover (PRD-167 PR 3) can be a transparent
 * URL swap rather than a contract rename.
 *
 * The legacy router enriches list rows with `title` + `posterUrl` joined from
 * `movies` / `tv_shows`. Those tables have not been split into `@pops/media-db`
 * yet, so the media-api shadow surface returns `null` for both fields. PRD-167
 * PR 3 cutover only flips traffic once the enrichment can be served from the
 * media pillar (post-PRD-165 / PRD-166).
 */
import { z } from 'zod';

import type { MediaWatchlistRow } from '@pops/media-db';

export type { MediaWatchlistRow };

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

export const MEDIA_TYPES = ['movie', 'tv_show'] as const;

export const WatchlistEntrySchema = z.object({
  id: z.number(),
  mediaType: z.string(),
  mediaId: z.number(),
  priority: z.number().nullable(),
  notes: z.string().nullable(),
  source: z.string().nullable(),
  plexRatingKey: z.string().nullable(),
  addedAt: z.string(),
  title: z.string().nullable(),
  posterUrl: z.string().nullable(),
});

export const AddToWatchlistSchema = z.object({
  mediaType: z.enum(MEDIA_TYPES),
  mediaId: z.number().int().positive(),
  priority: z.number().int().nonnegative().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type AddToWatchlistInput = z.infer<typeof AddToWatchlistSchema>;

export const UpdateWatchlistSchema = z.object({
  priority: z.number().int().nonnegative().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type UpdateWatchlistInput = z.infer<typeof UpdateWatchlistSchema>;

export const WatchlistQuerySchema = z.object({
  mediaType: z.enum(MEDIA_TYPES).optional(),
  limit: z.coerce.number().positive().max(500).optional(),
  offset: z.coerce.number().nonnegative().optional(),
});
export type WatchlistQueryRaw = z.infer<typeof WatchlistQuerySchema>;
