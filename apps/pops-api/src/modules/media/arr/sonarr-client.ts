/**
 * Sonarr API client — extends base *arr client with TV show-specific endpoints.
 */
import { ArrBaseClient } from "./base-client.js";
import type { SonarrSeries, SonarrQueueResponse, ArrStatusResult } from "./types.js";

export class SonarrClient extends ArrBaseClient {
  /** Fetch all monitored series from Sonarr. */
  async getSeries(): Promise<SonarrSeries[]> {
    return this.get<SonarrSeries[]>("/series");
  }

  /** Fetch a single series by Sonarr ID. */
  async getSeriesById(id: number): Promise<SonarrSeries> {
    return this.get<SonarrSeries>(`/series/${id}`);
  }

  /** Fetch the download queue. */
  async getQueue(): Promise<SonarrQueueResponse> {
    return this.get<SonarrQueueResponse>("/queue?includeSeries=true&includeEpisode=true");
  }

  /**
   * Get the status of a TV show by TVDB ID.
   * Fetches all series and queue, then matches by tvdbId.
   */
  async getShowStatus(tvdbId: number): Promise<ArrStatusResult> {
    const [series, queue] = await Promise.all([this.getSeries(), this.getQueue()]);

    const show = series.find((s) => s.tvdbId === tvdbId);

    if (!show) {
      return { status: "not_found", label: "Not in Sonarr" };
    }

    // Check download queue for any episodes of this series
    const queueItem = queue.records.find((r) => r.seriesId === show.id);
    if (queueItem) {
      const episodeLabel = queueItem.episode
        ? `S${String(queueItem.episode.seasonNumber).padStart(2, "0")}E${String(queueItem.episode.episodeNumber).padStart(2, "0")}`
        : "";
      return {
        status: "downloading",
        label: `Downloading${episodeLabel ? ` — ${episodeLabel}` : ""}`,
      };
    }

    if (!show.monitored) {
      return { status: "unmonitored", label: "Unmonitored" };
    }

    const { episodeFileCount, episodeCount } = show.statistics;

    if (episodeCount > 0 && episodeFileCount >= episodeCount) {
      return { status: "complete", label: "Complete" };
    }

    if (episodeFileCount > 0) {
      const stats = `${episodeFileCount}/${episodeCount} episodes`;
      return {
        status: "partial",
        label: `Partial (${stats})`,
        episodeStats: stats,
      };
    }

    return { status: "monitored", label: "Monitored" };
  }
}
