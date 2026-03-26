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

/** Valid sort options for the unified library list. */
export const librarySortOptions = ["title", "dateAdded", "releaseDate", "rating"] as const;
export type LibrarySortOption = (typeof librarySortOptions)[number];

/** Zod schema for the unified library list query. */
export const LibraryListSchema = z.object({
  type: z.enum(["all", "movie", "tv"]).optional().default("all"),
  sort: z.enum(librarySortOptions).optional().default("dateAdded"),
  search: z.string().optional(),
  genre: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(96).optional().default(24),
});
export type LibraryListInput = z.infer<typeof LibraryListSchema>;

/** A single item in the unified library list response. */
export interface LibraryItem {
  id: number;
  type: "movie" | "tv";
  title: string;
  year: number | null;
  posterUrl: string | null;
  genres: string[];
  voteAverage: number | null;
  createdAt: string;
  releaseDate: string | null;
}
