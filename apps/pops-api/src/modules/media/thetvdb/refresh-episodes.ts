import { eq } from 'drizzle-orm';

import { episodes, seasons } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import * as tvShowsService from '../tv-shows/service.js';

import type { TheTvdbClient } from './client.js';
import type { TvdbEpisode } from './types.js';

function updateSeasonEpisodeCount(seasonId: number, episodeCount: number): void {
  if (episodeCount <= 0) return;
  const db = getDrizzle();
  db.update(seasons).set({ episodeCount }).where(eq(seasons.id, seasonId)).run();
}

function upsertEpisodeRow(
  ep: TvdbEpisode,
  seasonId: number,
  counters: { added: number; updated: number }
): void {
  const db = getDrizzle();
  const existingEp = db.select().from(episodes).where(eq(episodes.tvdbId, ep.tvdbId)).get();
  if (existingEp) {
    db.update(episodes)
      .set({
        name: ep.name,
        overview: ep.overview,
        airDate: ep.airDate,
        runtime: ep.runtime,
        episodeNumber: ep.episodeNumber,
      })
      .where(eq(episodes.id, existingEp.id))
      .run();
    counters.updated++;
    return;
  }
  db.insert(episodes)
    .values({
      seasonId,
      tvdbId: ep.tvdbId,
      episodeNumber: ep.episodeNumber,
      name: ep.name,
      overview: ep.overview,
      airDate: ep.airDate,
      runtime: ep.runtime,
    })
    .run();
  counters.added++;
}

export interface RefreshEpisodesArgs {
  client: TheTvdbClient;
  tvdbId: number;
  showId: number;
  detail: Awaited<ReturnType<TheTvdbClient['getSeriesExtended']>>;
  seasonIdMap: Map<number, number>;
}

export interface EpisodeRefreshOutcome {
  episodesAdded: number;
  episodesUpdated: number;
}

export async function refreshEpisodesForAllSeasons(
  args: RefreshEpisodesArgs
): Promise<EpisodeRefreshOutcome> {
  const { client, tvdbId, showId, detail, seasonIdMap } = args;
  const counters = { added: 0, updated: 0 };

  for (const seasonSummary of detail.seasons) {
    const seasonId = seasonIdMap.get(seasonSummary.seasonNumber);
    if (seasonId === undefined) continue;
    let tvdbEpisodes: TvdbEpisode[];
    try {
      tvdbEpisodes = await client.getSeriesEpisodes(tvdbId, seasonSummary.seasonNumber);
    } catch {
      continue;
    }
    for (const ep of tvdbEpisodes) {
      upsertEpisodeRow(ep, seasonId, counters);
    }
    updateSeasonEpisodeCount(seasonId, tvdbEpisodes.length);
  }

  const db = getDrizzle();
  const totalEpisodes = db
    .select()
    .from(episodes)
    .innerJoin(seasons, eq(episodes.seasonId, seasons.id))
    .where(eq(seasons.tvShowId, showId))
    .all().length;
  tvShowsService.updateTvShow(showId, { numberOfEpisodes: totalEpisodes });

  return { episodesAdded: counters.added, episodesUpdated: counters.updated };
}
