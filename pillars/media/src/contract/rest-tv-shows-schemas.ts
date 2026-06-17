/**
 * Wire response schemas for the `tv-shows.*` REST sub-router — split from
 * `rest-tv-shows.ts` to keep both files within the per-file line cap.
 * Mirror the `toTvShow` / `toSeason` / `toEpisode` mappers exactly.
 */
import { z } from 'zod';

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

export const SeasonSchema = z.object({
  id: z.number(),
  tvShowId: z.number(),
  tvdbId: z.number(),
  seasonNumber: z.number(),
  name: z.string().nullable(),
  overview: z.string().nullable(),
  posterPath: z.string().nullable(),
  posterUrl: z.string().nullable(),
  airDate: z.string().nullable(),
  episodeCount: z.number().nullable(),
  createdAt: z.string(),
});

export const EpisodeSchema = z.object({
  id: z.number(),
  seasonId: z.number(),
  tvdbId: z.number(),
  episodeNumber: z.number(),
  name: z.string().nullable(),
  overview: z.string().nullable(),
  airDate: z.string().nullable(),
  stillPath: z.string().nullable(),
  voteAverage: z.number().nullable(),
  runtime: z.number().nullable(),
  createdAt: z.string(),
});
