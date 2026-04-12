import type { Database } from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  seedEpisode,
  seedMovie,
  seedSeason,
  seedTvShow,
  seedWatchHistoryEntry,
  seedWatchlistEntry,
  setupTestContext,
} from '../../../shared/test-utils.js';
import * as watchlistService from '../watchlist/service.js';
import * as service from './service.js';

const ctx = setupTestContext();
let db: Database;

beforeEach(() => {
  const result = ctx.setup();
  db = result.db;
});

afterEach(() => {
  ctx.teardown();
});

describe('listWatchHistory', () => {
  it('returns empty list when no entries exist', () => {
    const result = service.listWatchHistory({}, 50, 0);
    expect(result.rows).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('returns all entries with pagination', () => {
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: 1 });
    seedWatchHistoryEntry(db, { media_type: 'episode', media_id: 2 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: 3 });

    const result = service.listWatchHistory({}, 2, 0);
    expect(result.rows).toHaveLength(2);
    expect(result.total).toBe(3);
  });

  it('filters by mediaType', () => {
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: 1 });
    seedWatchHistoryEntry(db, { media_type: 'episode', media_id: 2 });

    const result = service.listWatchHistory({ mediaType: 'movie' }, 50, 0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.mediaType).toBe('movie');
  });

  it('filters by mediaId', () => {
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: 550 });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: 551 });

    const result = service.listWatchHistory({ mediaId: 550 }, 50, 0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.mediaId).toBe(550);
  });

  it('filters by both mediaType and mediaId', () => {
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: 550 });
    seedWatchHistoryEntry(db, { media_type: 'episode', media_id: 550 });

    const result = service.listWatchHistory({ mediaType: 'movie', mediaId: 550 }, 50, 0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.mediaType).toBe('movie');
  });
});

describe('listRecent', () => {
  it('returns empty list when no entries exist', () => {
    const result = service.listRecent({}, 50, 0);
    expect(result.rows).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('returns enriched movie entries with title and poster', () => {
    const movieId = seedMovie(db, { tmdb_id: 550, title: 'Fight Club', poster_path: '/fc.jpg' });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: movieId });

    const result = service.listRecent({}, 50, 0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.title).toBe('Fight Club');
    expect(result.rows[0]!.posterPath).toBe('/fc.jpg');
    expect(result.rows[0]!.seasonNumber).toBeNull();
    expect(result.rows[0]!.episodeNumber).toBeNull();
    expect(result.rows[0]!.showName).toBeNull();
  });

  it('returns enriched episode entries with show name and season/episode info', () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: 'Breaking Bad', poster_path: '/bb.jpg' });
    const seasonId = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    const epId = seedEpisode(db, {
      season_id: seasonId,
      tvdb_id: 5001,
      episode_number: 1,
      name: 'Pilot',
    });
    seedWatchHistoryEntry(db, { media_type: 'episode', media_id: epId });

    const result = service.listRecent({}, 50, 0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.title).toBe('Pilot');
    expect(result.rows[0]!.showName).toBe('Breaking Bad');
    expect(result.rows[0]!.posterPath).toBe('/bb.jpg');
    expect(result.rows[0]!.seasonNumber).toBe(1);
    expect(result.rows[0]!.episodeNumber).toBe(1);
  });

  it('filters by mediaType', () => {
    const movieId = seedMovie(db, { tmdb_id: 550, title: 'Fight Club' });
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: movieId });
    seedWatchHistoryEntry(db, { media_type: 'episode', media_id: 999 });

    const result = service.listRecent({ mediaType: 'movie' }, 50, 0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.mediaType).toBe('movie');
  });

  it('filters by startDate', () => {
    const movieId = seedMovie(db, { tmdb_id: 550, title: 'Fight Club' });
    seedWatchHistoryEntry(db, {
      media_type: 'movie',
      media_id: movieId,
      watched_at: '2026-01-01T00:00:00.000Z',
    });
    seedWatchHistoryEntry(db, {
      media_type: 'movie',
      media_id: movieId,
      watched_at: '2026-03-15T00:00:00.000Z',
    });

    const result = service.listRecent({ startDate: '2026-03-01T00:00:00.000Z' }, 50, 0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.watchedAt).toBe('2026-03-15T00:00:00.000Z');
  });

  it('filters by endDate', () => {
    const movieId = seedMovie(db, { tmdb_id: 550, title: 'Fight Club' });
    seedWatchHistoryEntry(db, {
      media_type: 'movie',
      media_id: movieId,
      watched_at: '2026-01-01T00:00:00.000Z',
    });
    seedWatchHistoryEntry(db, {
      media_type: 'movie',
      media_id: movieId,
      watched_at: '2026-03-15T00:00:00.000Z',
    });

    const result = service.listRecent({ endDate: '2026-02-01T00:00:00.000Z' }, 50, 0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.watchedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('filters by date range (startDate + endDate)', () => {
    const movieId = seedMovie(db, { tmdb_id: 550, title: 'Fight Club' });
    seedWatchHistoryEntry(db, {
      media_type: 'movie',
      media_id: movieId,
      watched_at: '2026-01-01T00:00:00.000Z',
    });
    seedWatchHistoryEntry(db, {
      media_type: 'movie',
      media_id: movieId,
      watched_at: '2026-02-15T00:00:00.000Z',
    });
    seedWatchHistoryEntry(db, {
      media_type: 'movie',
      media_id: movieId,
      watched_at: '2026-03-15T00:00:00.000Z',
    });

    const result = service.listRecent(
      { startDate: '2026-02-01T00:00:00.000Z', endDate: '2026-03-01T00:00:00.000Z' },
      50,
      0
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.watchedAt).toBe('2026-02-15T00:00:00.000Z');
  });

  it('combines mediaType + date range filters', () => {
    const movieId = seedMovie(db, { tmdb_id: 550, title: 'Fight Club' });
    seedWatchHistoryEntry(db, {
      media_type: 'movie',
      media_id: movieId,
      watched_at: '2026-03-15T00:00:00.000Z',
    });
    seedWatchHistoryEntry(db, {
      media_type: 'episode',
      media_id: 999,
      watched_at: '2026-03-15T00:00:00.000Z',
    });

    const result = service.listRecent(
      { mediaType: 'movie', startDate: '2026-03-01T00:00:00.000Z' },
      50,
      0
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.mediaType).toBe('movie');
  });

  it('handles missing media gracefully', () => {
    seedWatchHistoryEntry(db, { media_type: 'movie', media_id: 99999 });

    const result = service.listRecent({}, 50, 0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.title).toBeNull();
    expect(result.rows[0]!.posterPath).toBeNull();
  });

  it('supports pagination', () => {
    const movieId = seedMovie(db, { tmdb_id: 550, title: 'Fight Club' });
    seedWatchHistoryEntry(db, {
      media_type: 'movie',
      media_id: movieId,
      watched_at: '2026-01-01T00:00:00.000Z',
    });
    seedWatchHistoryEntry(db, {
      media_type: 'movie',
      media_id: movieId,
      watched_at: '2026-02-01T00:00:00.000Z',
    });
    seedWatchHistoryEntry(db, {
      media_type: 'movie',
      media_id: movieId,
      watched_at: '2026-03-01T00:00:00.000Z',
    });

    const page1 = service.listRecent({}, 2, 0);
    expect(page1.rows).toHaveLength(2);
    expect(page1.total).toBe(3);

    const page2 = service.listRecent({}, 2, 2);
    expect(page2.rows).toHaveLength(1);
    expect(page2.total).toBe(3);
  });
});

describe('getWatchHistoryEntry', () => {
  it('returns an entry by id', () => {
    const id = seedWatchHistoryEntry(db, { media_type: 'movie', media_id: 550 });
    const entry = service.getWatchHistoryEntry(id);
    expect(entry.mediaType).toBe('movie');
    expect(entry.mediaId).toBe(550);
    expect(entry.completed).toBe(1);
  });

  it('throws NotFoundError for missing entry', () => {
    expect(() => service.getWatchHistoryEntry(999)).toThrow('WatchHistoryEntry');
  });
});

describe('logWatch', () => {
  it('logs a watch event with defaults', () => {
    const { entry } = service.logWatch({
      mediaType: 'movie',
      mediaId: 550,
      completed: 1,
    });

    expect(entry.id).toBeGreaterThan(0);
    expect(entry.mediaType).toBe('movie');
    expect(entry.mediaId).toBe(550);
    expect(entry.completed).toBe(1);
    expect(entry.watchedAt).toBeTruthy();
  });

  it('logs a watch event with custom values', () => {
    const { entry } = service.logWatch({
      mediaType: 'episode',
      mediaId: 42,
      watchedAt: '2026-03-15T20:00:00.000Z',
      completed: 0,
    });

    expect(entry.mediaType).toBe('episode');
    expect(entry.watchedAt).toBe('2026-03-15T20:00:00.000Z');
    expect(entry.completed).toBe(0);
  });

  it('returns watchlistRemoved=true when movie was on watchlist', () => {
    seedWatchlistEntry(db, { media_type: 'movie', media_id: 550 });

    const { watchlistRemoved } = service.logWatch({
      mediaType: 'movie',
      mediaId: 550,
      completed: 1,
    });

    expect(watchlistRemoved).toBe(true);
  });

  it('returns watchlistRemoved=false when movie was not on watchlist', () => {
    const { watchlistRemoved } = service.logWatch({
      mediaType: 'movie',
      mediaId: 550,
      completed: 1,
    });

    expect(watchlistRemoved).toBe(false);
  });

  it('returns watchlistRemoved=false for incomplete watch', () => {
    seedWatchlistEntry(db, { media_type: 'movie', media_id: 550 });

    const { watchlistRemoved } = service.logWatch({
      mediaType: 'movie',
      mediaId: 550,
      completed: 0,
    });

    expect(watchlistRemoved).toBe(false);
  });

  it('returns watchlistRemoved=true when final episode completes TV show', () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: 'Test Show' });
    const sId = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    const ep1 = seedEpisode(db, { season_id: sId, tvdb_id: 5001, episode_number: 1 });
    const ep2 = seedEpisode(db, { season_id: sId, tvdb_id: 5002, episode_number: 2 });

    seedWatchlistEntry(db, { media_type: 'tv_show', media_id: showId });

    service.logWatch({ mediaType: 'episode', mediaId: ep1, completed: 1 });
    const { watchlistRemoved } = service.logWatch({
      mediaType: 'episode',
      mediaId: ep2,
      completed: 1,
    });

    expect(watchlistRemoved).toBe(true);
  });

  it('returns watchlistRemoved=false for non-final episode', () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: 'Test Show' });
    const sId = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    const ep1 = seedEpisode(db, { season_id: sId, tvdb_id: 5001, episode_number: 1 });
    seedEpisode(db, { season_id: sId, tvdb_id: 5002, episode_number: 2 });

    seedWatchlistEntry(db, { media_type: 'tv_show', media_id: showId });

    const { watchlistRemoved } = service.logWatch({
      mediaType: 'episode',
      mediaId: ep1,
      completed: 1,
    });

    expect(watchlistRemoved).toBe(false);
  });
});

describe('deleteWatchHistoryEntry', () => {
  it('deletes an existing entry', () => {
    const id = seedWatchHistoryEntry(db, { media_type: 'movie', media_id: 550 });

    service.deleteWatchHistoryEntry(id);
    expect(() => service.getWatchHistoryEntry(id)).toThrow('WatchHistoryEntry');
  });

  it('throws NotFoundError for missing entry', () => {
    expect(() => service.deleteWatchHistoryEntry(999)).toThrow('WatchHistoryEntry');
  });
});

describe('getProgress', () => {
  it('throws NotFoundError for non-existent TV show', () => {
    expect(() => service.getProgress(999)).toThrow('TvShow');
  });

  it('returns zero progress for a show with no episodes', () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: 'Empty Show' });

    const progress = service.getProgress(showId);
    expect(progress.tvShowId).toBe(showId);
    expect(progress.overall).toEqual({ watched: 0, total: 0, percentage: 0 });
    expect(progress.seasons).toHaveLength(0);
  });

  it('returns zero progress when no episodes are watched', () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: 'Test Show' });
    const sId = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    seedEpisode(db, { season_id: sId, tvdb_id: 5001, episode_number: 1 });
    seedEpisode(db, { season_id: sId, tvdb_id: 5002, episode_number: 2 });

    const progress = service.getProgress(showId);
    expect(progress.overall).toEqual({ watched: 0, total: 2, percentage: 0 });
    expect(progress.seasons).toHaveLength(1);
    expect(progress.seasons[0]).toEqual({
      seasonId: sId,
      seasonNumber: 1,
      watched: 0,
      total: 2,
      percentage: 0,
    });
  });

  it('returns correct progress with partial watches', () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: 'Test Show' });
    const sId = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    const ep1 = seedEpisode(db, { season_id: sId, tvdb_id: 5001, episode_number: 1 });
    seedEpisode(db, { season_id: sId, tvdb_id: 5002, episode_number: 2 });

    service.logWatch({ mediaType: 'episode', mediaId: ep1, completed: 1 });

    const progress = service.getProgress(showId);
    expect(progress.overall).toEqual({ watched: 1, total: 2, percentage: 50 });
    expect(progress.seasons[0]!.watched).toBe(1);
    expect(progress.seasons[0]!.percentage).toBe(50);
  });

  it('returns 100% when all episodes are watched', () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: 'Test Show' });
    const sId = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    const ep1 = seedEpisode(db, { season_id: sId, tvdb_id: 5001, episode_number: 1 });
    const ep2 = seedEpisode(db, { season_id: sId, tvdb_id: 5002, episode_number: 2 });

    service.logWatch({ mediaType: 'episode', mediaId: ep1, completed: 1 });
    service.logWatch({ mediaType: 'episode', mediaId: ep2, completed: 1 });

    const progress = service.getProgress(showId);
    expect(progress.overall).toEqual({ watched: 2, total: 2, percentage: 100 });
  });

  it('returns per-season progress across multiple seasons', () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: 'Test Show' });
    const s1Id = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    const s2Id = seedSeason(db, { tv_show_id: showId, tvdb_id: 3002, season_number: 2 });
    const ep1 = seedEpisode(db, { season_id: s1Id, tvdb_id: 5001, episode_number: 1 });
    const ep2 = seedEpisode(db, { season_id: s1Id, tvdb_id: 5002, episode_number: 2 });
    const ep3 = seedEpisode(db, { season_id: s2Id, tvdb_id: 5003, episode_number: 1 });
    seedEpisode(db, { season_id: s2Id, tvdb_id: 5004, episode_number: 2 });

    // Watch all of season 1 and one of season 2
    service.logWatch({ mediaType: 'episode', mediaId: ep1, completed: 1 });
    service.logWatch({ mediaType: 'episode', mediaId: ep2, completed: 1 });
    service.logWatch({ mediaType: 'episode', mediaId: ep3, completed: 1 });

    const progress = service.getProgress(showId);
    expect(progress.overall).toEqual({ watched: 3, total: 4, percentage: 75 });
    expect(progress.seasons).toHaveLength(2);
    expect(progress.seasons[0]).toEqual({
      seasonId: s1Id,
      seasonNumber: 1,
      watched: 2,
      total: 2,
      percentage: 100,
    });
    expect(progress.seasons[1]).toEqual({
      seasonId: s2Id,
      seasonNumber: 2,
      watched: 1,
      total: 2,
      percentage: 50,
    });
  });

  it('does not double-count rewatched episodes', () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: 'Test Show' });
    const sId = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    const ep1 = seedEpisode(db, { season_id: sId, tvdb_id: 5001, episode_number: 1 });
    seedEpisode(db, { season_id: sId, tvdb_id: 5002, episode_number: 2 });

    // Watch ep1 three times
    service.logWatch({ mediaType: 'episode', mediaId: ep1, completed: 1 });
    service.logWatch({ mediaType: 'episode', mediaId: ep1, completed: 1 });
    service.logWatch({ mediaType: 'episode', mediaId: ep1, completed: 1 });

    const progress = service.getProgress(showId);
    expect(progress.overall.watched).toBe(1);
    expect(progress.seasons[0]!.watched).toBe(1);
  });

  it('ignores incomplete watches', () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: 'Test Show' });
    const sId = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    const ep1 = seedEpisode(db, { season_id: sId, tvdb_id: 5001, episode_number: 1 });

    service.logWatch({ mediaType: 'episode', mediaId: ep1, completed: 0 });

    const progress = service.getProgress(showId);
    expect(progress.overall.watched).toBe(0);
  });
});

describe('auto-remove from watchlist (PRD-011 R6)', () => {
  it('removes movie from watchlist when marked as watched', () => {
    // Add movie 550 to watchlist
    const wlId = seedWatchlistEntry(db, { media_type: 'movie', media_id: 550 });

    // Log watch → should auto-remove from watchlist
    service.logWatch({ mediaType: 'movie', mediaId: 550, completed: 1 });

    // Watchlist entry should be gone
    expect(() => watchlistService.getWatchlistEntry(wlId)).toThrow('WatchlistEntry');
  });

  it('does not remove movie from watchlist when watch is incomplete', () => {
    const wlId = seedWatchlistEntry(db, { media_type: 'movie', media_id: 550 });

    service.logWatch({ mediaType: 'movie', mediaId: 550, completed: 0 });

    // Watchlist entry should still exist
    const entry = watchlistService.getWatchlistEntry(wlId);
    expect(entry.mediaId).toBe(550);
  });

  it('does not error when movie is not on watchlist', () => {
    // Log watch without any watchlist entry — should not throw
    expect(() => {
      service.logWatch({ mediaType: 'movie', mediaId: 999, completed: 1 });
    }).not.toThrow();
  });

  it('removes TV show from watchlist when all episodes are watched', () => {
    // Create a show with 2 seasons, 2 episodes each
    const showId = seedTvShow(db, { tvdb_id: 81189, name: 'Test Show' });
    const s1Id = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    const s2Id = seedSeason(db, { tv_show_id: showId, tvdb_id: 3002, season_number: 2 });
    const ep1 = seedEpisode(db, { season_id: s1Id, tvdb_id: 5001, episode_number: 1 });
    const ep2 = seedEpisode(db, { season_id: s1Id, tvdb_id: 5002, episode_number: 2 });
    const ep3 = seedEpisode(db, { season_id: s2Id, tvdb_id: 5003, episode_number: 1 });
    const ep4 = seedEpisode(db, { season_id: s2Id, tvdb_id: 5004, episode_number: 2 });

    // Add show to watchlist
    const wlId = seedWatchlistEntry(db, { media_type: 'tv_show', media_id: showId });

    // Watch first 3 episodes — show should stay on watchlist
    service.logWatch({ mediaType: 'episode', mediaId: ep1, completed: 1 });
    service.logWatch({ mediaType: 'episode', mediaId: ep2, completed: 1 });
    service.logWatch({ mediaType: 'episode', mediaId: ep3, completed: 1 });

    const stillThere = watchlistService.getWatchlistEntry(wlId);
    expect(stillThere.mediaId).toBe(showId);

    // Watch final episode → show should be removed from watchlist
    service.logWatch({ mediaType: 'episode', mediaId: ep4, completed: 1 });

    expect(() => watchlistService.getWatchlistEntry(wlId)).toThrow('WatchlistEntry');
  });

  it('does not remove TV show when individual episode is watched', () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: 'Test Show' });
    const sId = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    const ep1 = seedEpisode(db, { season_id: sId, tvdb_id: 5001, episode_number: 1 });
    seedEpisode(db, { season_id: sId, tvdb_id: 5002, episode_number: 2 });

    const wlId = seedWatchlistEntry(db, { media_type: 'tv_show', media_id: showId });

    // Watch only one of two episodes
    service.logWatch({ mediaType: 'episode', mediaId: ep1, completed: 1 });

    const entry = watchlistService.getWatchlistEntry(wlId);
    expect(entry.mediaId).toBe(showId);
  });

  it('handles episode not in database gracefully', () => {
    // Log watch for an episode ID that doesn't exist in episodes table
    expect(() => {
      service.logWatch({ mediaType: 'episode', mediaId: 99999, completed: 1 });
    }).not.toThrow();
  });

  it('allows re-watch after removal — movie can be re-added and re-watched', () => {
    // Add movie, watch it (auto-removed), re-add, re-watch
    seedWatchlistEntry(db, { media_type: 'movie', media_id: 550 });
    service.logWatch({
      mediaType: 'movie',
      mediaId: 550,
      completed: 1,
      watchedAt: '2026-01-01T12:00:00Z',
    });

    // Re-add to watchlist
    const wl2 = seedWatchlistEntry(db, { media_type: 'movie', media_id: 550 });

    // Re-watch → should auto-remove again (distinct watchedAt to avoid unique constraint)
    service.logWatch({
      mediaType: 'movie',
      mediaId: 550,
      completed: 1,
      watchedAt: '2026-01-02T12:00:00Z',
    });
    expect(() => watchlistService.getWatchlistEntry(wl2)).toThrow('WatchlistEntry');
  });

  it('handles duplicate episode watch — does not double-count', () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: 'Test Show' });
    const sId = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    const ep1 = seedEpisode(db, { season_id: sId, tvdb_id: 5001, episode_number: 1 });
    const ep2 = seedEpisode(db, { season_id: sId, tvdb_id: 5002, episode_number: 2 });

    const wlId = seedWatchlistEntry(db, { media_type: 'tv_show', media_id: showId });

    // Watch ep1 twice — should not count as both episodes watched
    service.logWatch({ mediaType: 'episode', mediaId: ep1, completed: 1 });
    service.logWatch({ mediaType: 'episode', mediaId: ep1, completed: 1 });

    // Show should still be on watchlist (ep2 unwatched)
    const entry = watchlistService.getWatchlistEntry(wlId);
    expect(entry.mediaId).toBe(showId);

    // Watch ep2 → now all episodes watched, should remove
    service.logWatch({ mediaType: 'episode', mediaId: ep2, completed: 1 });
    expect(() => watchlistService.getWatchlistEntry(wlId)).toThrow('WatchlistEntry');
  });
});

describe('priority re-sequencing after auto-removal', () => {
  it('re-sequences priorities after movie auto-removal', () => {
    seedWatchlistEntry(db, { media_type: 'movie', media_id: 100, priority: 0 });
    seedWatchlistEntry(db, { media_type: 'movie', media_id: 200, priority: 1 });
    seedWatchlistEntry(db, { media_type: 'movie', media_id: 300, priority: 2 });

    service.logWatch({ mediaType: 'movie', mediaId: 200, completed: 1 });

    const remaining = watchlistService.listWatchlist({}, 50, 0);
    expect(remaining.rows).toHaveLength(2);
    expect(remaining.rows[0]!.mediaId).toBe(100);
    expect(remaining.rows[0]!.priority).toBe(0);
    expect(remaining.rows[1]!.mediaId).toBe(300);
    expect(remaining.rows[1]!.priority).toBe(1);
  });

  it('re-sequences priorities after TV show auto-removal', () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: 'Test Show' });
    const sId = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    const ep1 = seedEpisode(db, { season_id: sId, tvdb_id: 5001, episode_number: 1 });

    seedWatchlistEntry(db, { media_type: 'movie', media_id: 999, priority: 0 });
    seedWatchlistEntry(db, { media_type: 'tv_show', media_id: showId, priority: 1 });
    seedWatchlistEntry(db, { media_type: 'movie', media_id: 888, priority: 2 });

    service.logWatch({ mediaType: 'episode', mediaId: ep1, completed: 1 });

    const remaining = watchlistService.listWatchlist({}, 50, 0);
    expect(remaining.rows).toHaveLength(2);
    expect(remaining.rows[0]!.priority).toBe(0);
    expect(remaining.rows[1]!.priority).toBe(1);
  });

  it('does not re-sequence when plex_sync source', () => {
    seedWatchlistEntry(db, { media_type: 'movie', media_id: 100, priority: 0 });
    seedWatchlistEntry(db, { media_type: 'movie', media_id: 200, priority: 1 });
    seedWatchlistEntry(db, { media_type: 'movie', media_id: 300, priority: 2 });

    service.logWatch({ mediaType: 'movie', mediaId: 200, completed: 1, source: 'plex_sync' });

    const remaining = watchlistService.listWatchlist({}, 50, 0);
    expect(remaining.rows).toHaveLength(3);
    expect(remaining.rows[1]!.priority).toBe(1);
  });

  it('does not re-sequence when TV show is partially watched', () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: 'Test Show' });
    const sId = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    const ep1 = seedEpisode(db, { season_id: sId, tvdb_id: 5001, episode_number: 1 });
    seedEpisode(db, { season_id: sId, tvdb_id: 5002, episode_number: 2 });

    seedWatchlistEntry(db, { media_type: 'movie', media_id: 999, priority: 0 });
    seedWatchlistEntry(db, { media_type: 'tv_show', media_id: showId, priority: 1 });
    seedWatchlistEntry(db, { media_type: 'movie', media_id: 888, priority: 2 });

    service.logWatch({ mediaType: 'episode', mediaId: ep1, completed: 1 });

    const remaining = watchlistService.listWatchlist({}, 50, 0);
    expect(remaining.rows).toHaveLength(3);
    expect(remaining.rows[0]!.priority).toBe(0);
    expect(remaining.rows[1]!.priority).toBe(1);
    expect(remaining.rows[2]!.priority).toBe(2);
  });

  it('re-sequences priorities after batch auto-removal', () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: 'Test Show' });
    const sId = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    seedEpisode(db, { season_id: sId, tvdb_id: 5001, episode_number: 1, air_date: '2020-01-01' });
    seedEpisode(db, { season_id: sId, tvdb_id: 5002, episode_number: 2, air_date: '2020-01-08' });

    seedWatchlistEntry(db, { media_type: 'movie', media_id: 100, priority: 0 });
    seedWatchlistEntry(db, { media_type: 'tv_show', media_id: showId, priority: 1 });
    seedWatchlistEntry(db, { media_type: 'movie', media_id: 200, priority: 2 });

    service.batchLogWatch({ mediaType: 'show', mediaId: showId, completed: 1 });

    const remaining = watchlistService.listWatchlist({}, 50, 0);
    expect(remaining.rows).toHaveLength(2);
    expect(remaining.rows[0]!.mediaId).toBe(100);
    expect(remaining.rows[0]!.priority).toBe(0);
    expect(remaining.rows[1]!.mediaId).toBe(200);
    expect(remaining.rows[1]!.priority).toBe(1);
  });
});

describe('batchLogWatch', () => {
  it('logs all episodes in a season', () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: 'Test Show' });
    const sId = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    seedEpisode(db, { season_id: sId, tvdb_id: 5001, episode_number: 1, air_date: '2020-01-01' });
    seedEpisode(db, { season_id: sId, tvdb_id: 5002, episode_number: 2, air_date: '2020-01-08' });
    seedEpisode(db, { season_id: sId, tvdb_id: 5003, episode_number: 3, air_date: '2020-01-15' });

    const result = service.batchLogWatch({ mediaType: 'season', mediaId: sId, completed: 1 });

    expect(result.logged).toBe(3);
    expect(result.skipped).toBe(0);

    // Verify entries exist
    const history = service.listWatchHistory({ mediaType: 'episode' }, 50, 0);
    expect(history.total).toBe(3);
  });

  it('logs all episodes across all seasons of a show', () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: 'Test Show' });
    const s1Id = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    const s2Id = seedSeason(db, { tv_show_id: showId, tvdb_id: 3002, season_number: 2 });
    seedEpisode(db, { season_id: s1Id, tvdb_id: 5001, episode_number: 1, air_date: '2020-01-01' });
    seedEpisode(db, { season_id: s1Id, tvdb_id: 5002, episode_number: 2, air_date: '2020-01-08' });
    seedEpisode(db, { season_id: s2Id, tvdb_id: 5003, episode_number: 1, air_date: '2020-06-01' });

    const result = service.batchLogWatch({ mediaType: 'show', mediaId: showId, completed: 1 });

    expect(result.logged).toBe(3);
    expect(result.skipped).toBe(0);
  });

  it('skips already-watched episodes', () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: 'Test Show' });
    const sId = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    const ep1 = seedEpisode(db, {
      season_id: sId,
      tvdb_id: 5001,
      episode_number: 1,
      air_date: '2020-01-01',
    });
    seedEpisode(db, { season_id: sId, tvdb_id: 5002, episode_number: 2, air_date: '2020-01-08' });

    // Watch ep1 individually first
    service.logWatch({ mediaType: 'episode', mediaId: ep1, completed: 1 });

    // Batch log the whole season — ep1 should be skipped
    const result = service.batchLogWatch({ mediaType: 'season', mediaId: sId, completed: 1 });

    expect(result.logged).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it('returns zeros for empty season', () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: 'Test Show' });
    const sId = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    // No episodes added

    const result = service.batchLogWatch({ mediaType: 'season', mediaId: sId, completed: 1 });

    expect(result.logged).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it('returns zeros for non-existent show', () => {
    const result = service.batchLogWatch({ mediaType: 'show', mediaId: 99999, completed: 1 });

    expect(result.logged).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it('removes TV show from watchlist when all episodes batch-logged for show', () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: 'Test Show' });
    const sId = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    seedEpisode(db, { season_id: sId, tvdb_id: 5001, episode_number: 1, air_date: '2020-01-01' });
    seedEpisode(db, { season_id: sId, tvdb_id: 5002, episode_number: 2, air_date: '2020-01-08' });

    const wlId = seedWatchlistEntry(db, { media_type: 'tv_show', media_id: showId });

    service.batchLogWatch({ mediaType: 'show', mediaId: showId, completed: 1 });

    expect(() => watchlistService.getWatchlistEntry(wlId)).toThrow('WatchlistEntry');
  });

  it('removes TV show from watchlist when all episodes batch-logged for season (single season show)', () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: 'Test Show' });
    const sId = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    seedEpisode(db, { season_id: sId, tvdb_id: 5001, episode_number: 1, air_date: '2020-01-01' });
    seedEpisode(db, { season_id: sId, tvdb_id: 5002, episode_number: 2, air_date: '2020-01-08' });

    const wlId = seedWatchlistEntry(db, { media_type: 'tv_show', media_id: showId });

    service.batchLogWatch({ mediaType: 'season', mediaId: sId, completed: 1 });

    expect(() => watchlistService.getWatchlistEntry(wlId)).toThrow('WatchlistEntry');
  });

  it('does not remove TV show from watchlist when only one season batch-logged (multi-season)', () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: 'Test Show' });
    const s1Id = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    const s2Id = seedSeason(db, { tv_show_id: showId, tvdb_id: 3002, season_number: 2 });
    seedEpisode(db, { season_id: s1Id, tvdb_id: 5001, episode_number: 1, air_date: '2020-01-01' });
    seedEpisode(db, { season_id: s2Id, tvdb_id: 5002, episode_number: 1, air_date: '2020-06-01' });

    const wlId = seedWatchlistEntry(db, { media_type: 'tv_show', media_id: showId });

    // Only batch log season 1
    service.batchLogWatch({ mediaType: 'season', mediaId: s1Id, completed: 1 });

    // Show should still be on watchlist
    const entry = watchlistService.getWatchlistEntry(wlId);
    expect(entry.mediaId).toBe(showId);
  });

  it('uses custom watchedAt for all entries', () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: 'Test Show' });
    const sId = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    seedEpisode(db, { season_id: sId, tvdb_id: 5001, episode_number: 1, air_date: '2020-01-01' });
    seedEpisode(db, { season_id: sId, tvdb_id: 5002, episode_number: 2, air_date: '2020-01-08' });

    const customDate = '2026-03-01T12:00:00.000Z';
    service.batchLogWatch({
      mediaType: 'season',
      mediaId: sId,
      watchedAt: customDate,
      completed: 1,
    });

    const history = service.listWatchHistory({ mediaType: 'episode' }, 50, 0);
    for (const row of history.rows) {
      expect(row.watchedAt).toBe(customDate);
    }
  });

  it('excludes future unaired episodes', () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: 'Test Show' });
    const sId = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    seedEpisode(db, { season_id: sId, tvdb_id: 5001, episode_number: 1, air_date: '2020-01-01' });
    seedEpisode(db, { season_id: sId, tvdb_id: 5002, episode_number: 2, air_date: '2020-01-08' });
    seedEpisode(db, { season_id: sId, tvdb_id: 5003, episode_number: 3, air_date: '2099-12-31' });

    const result = service.batchLogWatch({ mediaType: 'season', mediaId: sId, completed: 1 });

    // Only the 2 aired episodes should be logged, not the future one
    expect(result.logged).toBe(2);
    expect(result.skipped).toBe(0);
  });

  it('excludes episodes with null air date', () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: 'Test Show' });
    const sId = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    seedEpisode(db, { season_id: sId, tvdb_id: 5001, episode_number: 1, air_date: '2020-01-01' });
    seedEpisode(db, { season_id: sId, tvdb_id: 5002, episode_number: 2 }); // no air_date

    const result = service.batchLogWatch({ mediaType: 'season', mediaId: sId, completed: 1 });

    expect(result.logged).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it('excludes future episodes when batch-logging a whole show', () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: 'Test Show' });
    const s1Id = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    const s2Id = seedSeason(db, { tv_show_id: showId, tvdb_id: 3002, season_number: 2 });
    seedEpisode(db, { season_id: s1Id, tvdb_id: 5001, episode_number: 1, air_date: '2020-01-01' });
    seedEpisode(db, { season_id: s2Id, tvdb_id: 5002, episode_number: 1, air_date: '2099-06-01' });

    const result = service.batchLogWatch({ mediaType: 'show', mediaId: showId, completed: 1 });

    expect(result.logged).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it('does not skip when completed is 0 (re-logging incomplete watches)', () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: 'Test Show' });
    const sId = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    const ep1 = seedEpisode(db, {
      season_id: sId,
      tvdb_id: 5001,
      episode_number: 1,
      air_date: '2020-01-01',
    });
    seedEpisode(db, { season_id: sId, tvdb_id: 5002, episode_number: 2, air_date: '2020-01-08' });

    // Watch ep1 as completed
    service.logWatch({ mediaType: 'episode', mediaId: ep1, completed: 1 });

    // Batch log with completed=0 — should not skip any (different semantics)
    const result = service.batchLogWatch({ mediaType: 'season', mediaId: sId, completed: 0 });

    expect(result.logged).toBe(2);
    expect(result.skipped).toBe(0);
  });
});

describe('logWatch blacklist check', () => {
  it('skips insert when a blacklisted entry exists at the same timestamp', () => {
    seedMovie(db, { tmdb_id: 999 });
    const movieId = db.prepare('SELECT id FROM movies WHERE tmdb_id = 999').get() as { id: number };

    // Seed a blacklisted watch event
    seedWatchHistoryEntry(db, {
      media_type: 'movie',
      media_id: movieId.id,
      watched_at: '2026-01-15T20:00:00.000Z',
      blacklisted: 1,
    });

    // Attempt to log watch at the same timestamp — should be skipped
    const result = service.logWatch({
      mediaType: 'movie',
      mediaId: movieId.id,
      watchedAt: '2026-01-15T20:00:00.000Z',
    });

    expect(result.created).toBe(false);
    expect(result.entry.blacklisted).toBe(1);

    // Only the one blacklisted row should exist
    const rows = db.prepare('SELECT * FROM watch_history WHERE media_id = ?').all(movieId.id) as {
      blacklisted: number;
    }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.blacklisted).toBe(1);
  });

  it('allows insert at a different timestamp for the same blacklisted movie', () => {
    seedMovie(db, { tmdb_id: 888 });
    const movieId = db.prepare('SELECT id FROM movies WHERE tmdb_id = 888').get() as { id: number };

    // Seed a blacklisted watch event
    seedWatchHistoryEntry(db, {
      media_type: 'movie',
      media_id: movieId.id,
      watched_at: '2026-01-15T20:00:00.000Z',
      blacklisted: 1,
    });

    // Log watch at a DIFFERENT timestamp — should succeed
    const result = service.logWatch({
      mediaType: 'movie',
      mediaId: movieId.id,
      watchedAt: '2026-03-01T20:00:00.000Z',
    });

    expect(result.created).toBe(true);
    expect(result.entry.blacklisted).toBe(0);

    // Both rows should exist
    const rows = db.prepare('SELECT * FROM watch_history WHERE media_id = ?').all(movieId.id);
    expect(rows).toHaveLength(2);
  });

  it('does not skip when a non-blacklisted entry exists at the same timestamp', () => {
    seedMovie(db, { tmdb_id: 777 });
    const movieId = db.prepare('SELECT id FROM movies WHERE tmdb_id = 777').get() as { id: number };

    // Seed a normal (non-blacklisted) watch event
    seedWatchHistoryEntry(db, {
      media_type: 'movie',
      media_id: movieId.id,
      watched_at: '2026-01-15T20:00:00.000Z',
      blacklisted: 0,
    });

    // Log watch at the same timestamp — should return existing (onConflictDoNothing)
    const result = service.logWatch({
      mediaType: 'movie',
      mediaId: movieId.id,
      watchedAt: '2026-01-15T20:00:00.000Z',
    });

    expect(result.created).toBe(false);
    expect(result.entry.blacklisted).toBe(0);
  });
});

describe('batchLogWatch blacklist check', () => {
  it('skips blacklisted episodes at the same timestamp', () => {
    const showId = seedTvShow(db, { tvdb_id: 6000 });
    const sId = seedSeason(db, { tv_show_id: showId, season_number: 1, tvdb_id: 6001 });
    const ep1 = seedEpisode(db, {
      season_id: sId,
      tvdb_id: 6002,
      episode_number: 1,
      air_date: '2020-01-01',
    });
    seedEpisode(db, {
      season_id: sId,
      tvdb_id: 6003,
      episode_number: 2,
      air_date: '2020-01-08',
    });

    const watchedAt = '2026-02-01T20:00:00.000Z';

    // Blacklist ep1 at this timestamp
    seedWatchHistoryEntry(db, {
      media_type: 'episode',
      media_id: ep1,
      watched_at: watchedAt,
      blacklisted: 1,
    });

    // Batch log the season — ep1 should be skipped, ep2 logged
    const result = service.batchLogWatch({
      mediaType: 'season',
      mediaId: sId,
      completed: 1,
      watchedAt,
    });

    expect(result.logged).toBe(1);
    expect(result.skipped).toBe(1);
  });
});
