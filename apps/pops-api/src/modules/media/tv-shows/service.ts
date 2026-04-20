/**
 * TV Shows service — re-exports of CRUD operations for tv_shows, seasons, episodes.
 *
 * Implementation lives in:
 *  - tv-shows-base.ts    — shows CRUD
 *  - seasons-service.ts  — seasons CRUD
 *  - episodes-service.ts — episodes CRUD
 */
export {
  createTvShow,
  deleteTvShow,
  getTvShow,
  getTvShowByTvdbId,
  listTvShows,
  type TvShowListResult,
  updateTvShow,
} from './tv-shows-base.js';

export {
  createSeason,
  deleteSeason,
  getSeason,
  listSeasons,
  type SeasonListResult,
} from './seasons-service.js';

export {
  createEpisode,
  deleteEpisode,
  getEpisode,
  type EpisodeListResult,
  listEpisodes,
} from './episodes-service.js';
