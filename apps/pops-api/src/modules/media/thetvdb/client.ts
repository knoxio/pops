/**
 * TheTVDB v4 HTTP client — typed wrapper around the TheTVDB REST API.
 *
 * Handles request construction, response parsing, error mapping,
 * and automatic 401 re-authentication retry.
 */
import type { TheTvdbAuth } from './auth.js';
import { fetchWithRetry } from './rate-limiter.js';
import {
  type RawTvdbArtwork,
  type RawTvdbEpisodesResponse,
  type RawTvdbSearchResponse,
  type RawTvdbSeasonSummary,
  type RawTvdbSeriesExtendedResponse,
  TvdbApiError,
  type TvdbArtwork,
  type TvdbEpisode,
  type TvdbSearchResult,
  type TvdbSeasonSummary,
  type TvdbShowDetail,
} from './types.js';

const BASE_URL = 'https://api4.thetvdb.com/v4';

export class TheTvdbClient {
  private readonly auth: TheTvdbAuth;

  constructor(auth: TheTvdbAuth) {
    this.auth = auth;
  }

  /** Search for TV series by query string. */
  async searchSeries(query: string): Promise<TvdbSearchResult[]> {
    const params = new URLSearchParams({ q: query, type: 'series' });
    const raw = await this.get<RawTvdbSearchResponse>(`/search?${params.toString()}`);

    return raw.data.map((r) => ({
      tvdbId: Number(r.tvdb_id ?? r.objectID ?? 0),
      name: r.name,
      originalName: r.name_translated?.eng ?? null,
      overview: r.overview ?? r.overviews?.eng ?? null,
      firstAirDate: r.first_air_time ?? null,
      status: r.status ?? null,
      posterPath: r.image_url ?? r.thumbnail ?? null,
      genres: r.genres ?? [],
      originalLanguage: r.primary_language ?? null,
      year: r.year ?? null,
    }));
  }

  /** Get extended series detail by TheTVDB ID. */
  async getSeriesExtended(tvdbId: number): Promise<TvdbShowDetail> {
    const raw = await this.get<RawTvdbSeriesExtendedResponse>(`/series/${tvdbId}/extended`);
    const d = raw.data;

    const mapSeason = (s: RawTvdbSeasonSummary): TvdbSeasonSummary => ({
      tvdbId: s.id,
      seasonNumber: s.number,
      name: s.name ?? null,
      overview: s.overview ?? null,
      imageUrl: s.image ?? null,
      episodeCount: Array.isArray(s.episodes) ? s.episodes.length : 0,
    });

    const mapArtwork = (a: RawTvdbArtwork): TvdbArtwork => ({
      id: a.id,
      type: a.type,
      imageUrl: a.image,
      language: a.language,
      score: a.score,
    });

    // Filter seasons to only "default" type (broadcast order)
    const seasons = (d.seasons ?? []).filter(
      (s) => !s.type || s.type.type === 'default' || s.type.type === 'official'
    );

    return {
      tvdbId: d.id,
      name: d.name,
      originalName: d.originalName ?? null,
      overview: d.overview ?? null,
      firstAirDate: d.firstAired ?? null,
      lastAirDate: d.lastAired ?? null,
      status: d.status?.name ?? null,
      originalLanguage: d.originalLanguage ?? null,
      averageRuntime: d.averageRuntime ?? null,
      genres: (d.genres ?? []).map((g) => ({ id: g.id, name: g.name })),
      networks: (d.networks ?? []).map((n) => ({ id: n.id, name: n.name })),
      seasons: seasons.map(mapSeason),
      artworks: (d.artworks ?? []).map(mapArtwork),
    };
  }

  /** Get episodes for a specific season of a series. */
  async getSeriesEpisodes(tvdbId: number, seasonNumber: number): Promise<TvdbEpisode[]> {
    const raw = await this.get<RawTvdbEpisodesResponse>(
      `/series/${tvdbId}/episodes/default?season=${seasonNumber}`
    );

    return raw.data.episodes.map((e) => ({
      tvdbId: e.id,
      episodeNumber: e.number,
      seasonNumber: e.seasonNumber,
      name: e.name ?? null,
      overview: e.overview ?? null,
      airDate: e.aired ?? null,
      runtime: e.runtime ?? null,
      imageUrl: e.image ?? null,
    }));
  }

  /** Generic GET with Bearer auth, error handling, and 401 retry. */
  private async get<T>(path: string, isRetry = false): Promise<T> {
    const token = await this.auth.getToken();
    let response: Response;

    try {
      response = await fetchWithRetry(() =>
        fetch(`${BASE_URL}${path}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        })
      );
    } catch (err) {
      throw new TvdbApiError(
        0,
        `Network error: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // On 401, invalidate token and retry once
    if (response.status === 401 && !isRetry) {
      this.auth.invalidate();
      return this.get<T>(path, true);
    }

    if (!response.ok) {
      let message = `TheTVDB API error: ${response.status} ${response.statusText}`;
      try {
        const body = (await response.json()) as { message?: string };
        if (body.message) {
          message = body.message;
        }
      } catch {
        // Ignore parse failures
      }
      throw new TvdbApiError(response.status, message);
    }

    return (await response.json()) as T;
  }
}
