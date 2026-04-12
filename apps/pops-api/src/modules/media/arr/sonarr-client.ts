/**
 * Sonarr API client — extends base *arr client with TV show-specific endpoints.
 */
import { ArrBaseClient } from './base-client.js';
import type {
  ArrStatusResult,
  SonarrAddSeriesInput,
  SonarrCalendarEpisode,
  SonarrCommandResponse,
  SonarrEpisode,
  SonarrEpisodeMonitorInput,
  SonarrLanguageProfile,
  SonarrQualityProfile,
  SonarrQueueResponse,
  SonarrRootFolder,
  SonarrSeries,
  SonarrSeriesFull,
} from './types.js';

export class SonarrClient extends ArrBaseClient {
  /** Fetch all monitored series from Sonarr. */
  async getSeries(): Promise<SonarrSeries[]> {
    return this.get<SonarrSeries[]>('/series');
  }

  /** Fetch a single series by Sonarr ID. */
  async getSeriesById(id: number): Promise<SonarrSeries> {
    return this.get<SonarrSeries>(`/series/${id}`);
  }

  /** Fetch the download queue. */
  async getQueue(): Promise<SonarrQueueResponse> {
    return this.get<SonarrQueueResponse>('/queue?includeSeries=true&includeEpisode=true');
  }

  /** Fetch upcoming episodes from the Sonarr calendar. */
  async getCalendar(start: string, end: string): Promise<SonarrCalendarEpisode[]> {
    return this.get<SonarrCalendarEpisode[]>(
      `/calendar?start=${start}&end=${end}&includeSeries=true`
    );
  }

  /**
   * Get the status of a TV show by TVDB ID.
   * Uses the filtered endpoint to fetch only the matching series, then checks queue.
   */
  async getShowStatus(tvdbId: number): Promise<ArrStatusResult> {
    const series = await this.get<SonarrSeries[]>(`/series?tvdbId=${tvdbId}`);
    const show = series[0];

    if (!show) {
      return { status: 'not_found', label: 'Not in Sonarr' };
    }

    // Check download queue only if the show exists in Sonarr
    const queue = await this.getQueue();
    const queueItem = queue.records.find((r) => r.seriesId === show.id);
    if (queueItem) {
      const episodeLabel = queueItem.episode
        ? `S${String(queueItem.episode.seasonNumber).padStart(2, '0')}E${String(queueItem.episode.episodeNumber).padStart(2, '0')}`
        : '';
      return {
        status: 'downloading',
        label: `Downloading${episodeLabel ? ` — ${episodeLabel}` : ''}`,
      };
    }

    if (!show.monitored) {
      return { status: 'unmonitored', label: 'Unmonitored' };
    }

    const { episodeFileCount, episodeCount } = show.statistics;

    if (episodeCount > 0 && episodeFileCount >= episodeCount) {
      return { status: 'complete', label: 'Complete' };
    }

    if (episodeFileCount > 0) {
      const stats = `${episodeFileCount}/${episodeCount} episodes`;
      return {
        status: 'partial',
        label: `Partial (${stats})`,
        episodeStats: stats,
      };
    }

    return { status: 'monitored', label: 'Monitored' };
  }

  /**
   * Check if a series exists in Sonarr by TVDB ID.
   * Returns the Sonarr ID, monitored state, and per-season monitoring flags.
   */
  async checkSeries(tvdbId: number): Promise<{
    exists: boolean;
    sonarrId?: number;
    monitored?: boolean;
    seasons?: Array<{ seasonNumber: number; monitored: boolean }>;
  }> {
    const allSeries = await this.getSeries();
    const match = allSeries.find((s) => s.tvdbId === tvdbId);
    if (!match) return { exists: false };

    // Fetch full series to get per-season monitoring state
    const full = await this.get<SonarrSeriesFull>(`/series/${match.id}`);
    const seasons = full.seasons.map((s) => ({
      seasonNumber: s.seasonNumber,
      monitored: s.monitored,
    }));

    return { exists: true, sonarrId: match.id, monitored: match.monitored, seasons };
  }

  /**
   * Update season monitoring for a specific season.
   * Fetches the full series, updates the target season's monitored flag, then PUTs back.
   */
  async updateSeasonMonitoring(
    sonarrId: number,
    seasonNumber: number,
    monitored: boolean
  ): Promise<SonarrSeriesFull> {
    const series = await this.get<SonarrSeriesFull>(`/series/${sonarrId}`);
    const season = series.seasons.find((s) => s.seasonNumber === seasonNumber);
    if (!season) {
      throw new Error(`Season ${seasonNumber} not found for series ${sonarrId}`);
    }
    season.monitored = monitored;
    return this.put<SonarrSeriesFull>(`/series/${sonarrId}`, series);
  }

  /**
   * Batch update episode monitoring.
   * Sends PUT /api/v3/episode/monitor with episode IDs and monitored flag.
   */
  async updateEpisodeMonitoring(episodeIds: number[], monitored: boolean): Promise<void> {
    const body: SonarrEpisodeMonitorInput = { episodeIds, monitored };
    await this.put<unknown>('/episode/monitor', body);
  }

  /** Fetch episodes for a series, optionally filtered by season. */
  async getEpisodes(seriesId: number, seasonNumber?: number): Promise<SonarrEpisode[]> {
    let path = `/episode?seriesId=${seriesId}`;
    if (seasonNumber !== undefined) {
      path += `&seasonNumber=${seasonNumber}`;
    }
    return this.get<SonarrEpisode[]>(path);
  }

  /** Fetch quality profiles from Sonarr. */
  async getQualityProfiles(): Promise<SonarrQualityProfile[]> {
    return this.get<SonarrQualityProfile[]>('/qualityprofile');
  }

  /** Fetch root folders from Sonarr. */
  async getRootFolders(): Promise<SonarrRootFolder[]> {
    return this.get<SonarrRootFolder[]>('/rootfolder');
  }

  /** Fetch language profiles from Sonarr. */
  async getLanguageProfiles(): Promise<SonarrLanguageProfile[]> {
    return this.get<SonarrLanguageProfile[]>('/languageprofile');
  }

  /** Add a series to Sonarr. */
  async addSeries(input: SonarrAddSeriesInput): Promise<SonarrSeriesFull> {
    return this.post<SonarrSeriesFull>('/series', {
      tvdbId: input.tvdbId,
      title: input.title,
      qualityProfileId: input.qualityProfileId,
      rootFolderPath: input.rootFolderPath,
      languageProfileId: input.languageProfileId,
      seasons: input.seasons.map((s) => ({
        seasonNumber: s.seasonNumber,
        monitored: s.monitored,
      })),
      monitored: true,
      addOptions: { searchForMissingEpisodes: false },
    });
  }

  /** Update monitoring flag for a series. Fetches full series first, merges, then PUTs. */
  async updateMonitoring(sonarrId: number, monitored: boolean): Promise<SonarrSeriesFull> {
    const series = await this.get<SonarrSeriesFull>(`/series/${sonarrId}`);
    return this.put<SonarrSeriesFull>(`/series/${sonarrId}`, { ...series, monitored });
  }

  /** Trigger a search for a series or a specific season. */
  async triggerSearch(sonarrId: number, seasonNumber?: number): Promise<SonarrCommandResponse> {
    if (seasonNumber !== undefined) {
      return this.post<SonarrCommandResponse>('/command', {
        name: 'SeasonSearch',
        seriesId: sonarrId,
        seasonNumber,
      });
    }
    return this.post<SonarrCommandResponse>('/command', {
      name: 'SeriesSearch',
      seriesId: sonarrId,
    });
  }
}
