/**
 * Media library types — schemas for add-to-library and refresh operations.
 */
import { z } from "zod";

/** Zod schema for refreshing movie metadata from TMDB. */
export const RefreshMovieSchema = z.object({
  id: z.number().int().positive(),
});
export type RefreshMovieInput = z.infer<typeof RefreshMovieSchema>;
