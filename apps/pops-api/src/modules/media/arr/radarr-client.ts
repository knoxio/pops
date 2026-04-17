/**
 * Radarr API client — extends base *arr client with movie-specific endpoints.
 */
import { ArrBaseClient } from './base-client.js';

import type {
  ArrStatusResult,
  RadarrAddMovieInput,
  RadarrCheckResult,
  RadarrCommandResponse,
  RadarrDiskSpace,
  RadarrMovie,
  RadarrQualityProfile,
  RadarrQueueResponse,
  RadarrRootFolder,
} from './types.js';

export class RadarrClient extends ArrBaseClient {
  /** Fetch all monitored movies from Radarr. */
  async getMovies(): Promise<RadarrMovie[]> {
    return this.get<RadarrMovie[]>('/movie');
  }

  /** Fetch a single movie by Radarr ID. */
  async getMovie(id: number): Promise<RadarrMovie> {
    return this.get<RadarrMovie>(`/movie/${id}`);
  }

  /** Fetch the download queue. */
  async getQueue(): Promise<RadarrQueueResponse> {
    return this.get<RadarrQueueResponse>('/queue?includeMovie=true');
  }

  /** Fetch quality profiles from Radarr. */
  async getQualityProfiles(): Promise<RadarrQualityProfile[]> {
    return this.get<RadarrQualityProfile[]>('/qualityprofile');
  }

  /** Fetch root folders from Radarr. */
  async getRootFolders(): Promise<RadarrRootFolder[]> {
    return this.get<RadarrRootFolder[]>('/rootfolder');
  }

  /** Check if a movie exists in Radarr by TMDB ID. */
  async checkMovie(tmdbId: number): Promise<RadarrCheckResult> {
    const movies = await this.get<RadarrMovie[]>(`/movie?tmdbId=${tmdbId}`);
    const movie = movies[0];
    if (!movie) {
      return { exists: false };
    }
    return { exists: true, radarrId: movie.id, monitored: movie.monitored };
  }

  /** Add a movie to Radarr. */
  async addMovie(input: RadarrAddMovieInput): Promise<RadarrMovie> {
    return this.post<RadarrMovie>('/movie', {
      tmdbId: input.tmdbId,
      title: input.title,
      year: input.year,
      qualityProfileId: input.qualityProfileId,
      rootFolderPath: input.rootFolderPath,
      monitored: true,
      addOptions: { searchForMovie: true },
    });
  }

  /** Update monitoring flag for a movie. Fetches full movie first, merges, then PUTs. */
  async updateMonitoring(radarrId: number, monitored: boolean): Promise<RadarrMovie> {
    const movie = await this.getMovie(radarrId);
    return this.put<RadarrMovie>(`/movie/${radarrId}`, { ...movie, monitored });
  }

  /** Trigger a search for a movie in Radarr. */
  async triggerSearch(radarrId: number): Promise<RadarrCommandResponse> {
    return this.post<RadarrCommandResponse>('/command', {
      name: 'MoviesSearch',
      movieIds: [radarrId],
    });
  }

  /** Fetch disk space info from Radarr. */
  async getDiskSpace(): Promise<RadarrDiskSpace[]> {
    return this.get<RadarrDiskSpace[]>('/diskspace');
  }

  /** Delete a movie from Radarr by its Radarr ID. Set deleteFiles to also remove files. */
  async deleteMovie(radarrId: number, deleteFiles = true): Promise<void> {
    await this.delete(`/movie/${radarrId}?deleteFiles=${deleteFiles}`);
  }

  /**
   * Get the status of a movie by TMDB ID.
   * Uses the filtered endpoint to fetch only the matching movie, then checks queue.
   */
  async getMovieStatus(tmdbId: number): Promise<ArrStatusResult> {
    const movies = await this.get<RadarrMovie[]>(`/movie?tmdbId=${tmdbId}`);
    const movie = movies[0];

    if (!movie) {
      return { status: 'not_found', label: 'Not in Radarr' };
    }

    // Check download queue only if the movie exists in Radarr
    const queue = await this.getQueue();
    const queueItem = queue.records.find((r) => r.movieId === movie.id);
    if (queueItem) {
      const progress =
        queueItem.size > 0
          ? Math.round(((queueItem.size - queueItem.sizeleft) / queueItem.size) * 100)
          : 0;
      return {
        status: 'downloading',
        label: `Downloading ${progress}%`,
        progress,
      };
    }

    if (movie.hasFile) {
      return { status: 'available', label: 'Available' };
    }

    if (movie.monitored) {
      return { status: 'monitored', label: 'Monitored' };
    }

    return { status: 'unmonitored', label: 'Unmonitored' };
  }
}
