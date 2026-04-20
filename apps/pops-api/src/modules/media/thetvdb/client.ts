import { fetchWithRetry } from './rate-limiter.js';
import {
  mapEpisode,
  mapSearchResult,
  mapShowDetail,
  type RawTvdbEpisodesResponse,
  type RawTvdbSearchResponse,
  type RawTvdbSeriesExtendedResponse,
  TvdbApiError,
  type TvdbEpisode,
  type TvdbSearchResult,
  type TvdbShowDetail,
} from './types.js';

/**
 * TheTVDB v4 HTTP client — typed wrapper around the TheTVDB REST API.
 *
 * Handles request construction, response parsing, error mapping,
 * and automatic 401 re-authentication retry.
 */
import type { TheTvdbAuth } from './auth.js';

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
    return raw.data.map(mapSearchResult);
  }

  /** Get extended series detail by TheTVDB ID. */
  async getSeriesExtended(tvdbId: number): Promise<TvdbShowDetail> {
    const raw = await this.get<RawTvdbSeriesExtendedResponse>(`/series/${tvdbId}/extended`);
    return mapShowDetail(raw.data);
  }

  /** Get episodes for a specific season of a series. */
  async getSeriesEpisodes(tvdbId: number, seasonNumber: number): Promise<TvdbEpisode[]> {
    const raw = await this.get<RawTvdbEpisodesResponse>(
      `/series/${tvdbId}/episodes/default?season=${seasonNumber}`
    );
    return raw.data.episodes.map(mapEpisode);
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
