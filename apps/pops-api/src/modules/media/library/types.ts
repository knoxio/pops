/**
 * Media library types — schemas for add-to-library and refresh operations.
 */
import { z } from "zod";

/** Zod schema for refreshing movie metadata from TMDB. */
export const RefreshMovieSchema = z.object({
  id: z.number().int().positive(),
});
export type RefreshMovieInput = z.infer<typeof RefreshMovieSchema>;

/** Zod schema for the quick-pick query. */
export const QuickPickSchema = z.object({
  count: z.coerce.number().int().positive().max(10).optional().default(3),
});
export type QuickPickInput = z.infer<typeof QuickPickSchema>;
