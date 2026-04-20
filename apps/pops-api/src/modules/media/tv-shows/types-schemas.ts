import { z } from 'zod';

/** Zod schema for the TV show response shape. */
export const TvShowSchema = z.object({
  id: z.number(),
  tvdbId: z.number(),
  name: z.string(),
  originalName: z.string().nullable(),
  overview: z.string().nullable(),
  firstAirDate: z.string().nullable(),
  lastAirDate: z.string().nullable(),
  status: z.string().nullable(),
  originalLanguage: z.string().nullable(),
  numberOfSeasons: z.number().nullable(),
  numberOfEpisodes: z.number().nullable(),
  episodeRunTime: z.number().nullable(),
  posterPath: z.string().nullable(),
  posterUrl: z.string().nullable(),
  backdropPath: z.string().nullable(),
  backdropUrl: z.string().nullable(),
  logoPath: z.string().nullable(),
  logoUrl: z.string().nullable(),
  posterOverridePath: z.string().nullable(),
  voteAverage: z.number().nullable(),
  voteCount: z.number().nullable(),
  genres: z.array(z.string()),
  networks: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreateTvShowSchema = z.object({
  tvdbId: z.number().int().positive(),
  name: z.string().min(1, 'Name is required'),
  originalName: z.string().nullable().optional(),
  overview: z.string().nullable().optional(),
  firstAirDate: z.string().nullable().optional(),
  lastAirDate: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  originalLanguage: z.string().nullable().optional(),
  numberOfSeasons: z.number().int().nullable().optional(),
  numberOfEpisodes: z.number().int().nullable().optional(),
  episodeRunTime: z.number().int().nullable().optional(),
  posterPath: z.string().nullable().optional(),
  backdropPath: z.string().nullable().optional(),
  logoPath: z.string().nullable().optional(),
  posterOverridePath: z.string().nullable().optional(),
  voteAverage: z.number().nullable().optional(),
  voteCount: z.number().int().nullable().optional(),
  genres: z.array(z.string()).optional(),
  networks: z.array(z.string()).optional(),
});
export type CreateTvShowInput = z.infer<typeof CreateTvShowSchema>;

export const UpdateTvShowSchema = z.object({
  name: z.string().min(1).optional(),
  originalName: z.string().nullable().optional(),
  overview: z.string().nullable().optional(),
  firstAirDate: z.string().nullable().optional(),
  lastAirDate: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  originalLanguage: z.string().nullable().optional(),
  numberOfSeasons: z.number().int().nullable().optional(),
  numberOfEpisodes: z.number().int().nullable().optional(),
  episodeRunTime: z.number().int().nullable().optional(),
  posterPath: z.string().nullable().optional(),
  backdropPath: z.string().nullable().optional(),
  logoPath: z.string().nullable().optional(),
  posterOverridePath: z.string().nullable().optional(),
  voteAverage: z.number().nullable().optional(),
  voteCount: z.number().int().nullable().optional(),
  genres: z.array(z.string()).optional(),
  networks: z.array(z.string()).optional(),
});
export type UpdateTvShowInput = z.infer<typeof UpdateTvShowSchema>;

export const TvShowQuerySchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  limit: z.coerce.number().positive().optional(),
  offset: z.coerce.number().nonnegative().optional(),
});
export type TvShowQuery = z.infer<typeof TvShowQuerySchema>;

export const CreateSeasonSchema = z.object({
  tvShowId: z.number().int().positive(),
  tvdbId: z.number().int().positive(),
  seasonNumber: z.number().int().nonnegative(),
  name: z.string().nullable().optional(),
  overview: z.string().nullable().optional(),
  posterPath: z.string().nullable().optional(),
  airDate: z.string().nullable().optional(),
  episodeCount: z.number().int().nullable().optional(),
});
export type CreateSeasonInput = z.infer<typeof CreateSeasonSchema>;

export const CreateEpisodeSchema = z.object({
  seasonId: z.number().int().positive(),
  tvdbId: z.number().int().positive(),
  episodeNumber: z.number().int().nonnegative(),
  name: z.string().nullable().optional(),
  overview: z.string().nullable().optional(),
  airDate: z.string().nullable().optional(),
  stillPath: z.string().nullable().optional(),
  voteAverage: z.number().nullable().optional(),
  runtime: z.number().int().nullable().optional(),
});
export type CreateEpisodeInput = z.infer<typeof CreateEpisodeSchema>;
