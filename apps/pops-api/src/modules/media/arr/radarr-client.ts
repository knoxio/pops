/**
 * Radarr API client — extends base *arr client with movie-specific endpoints.
 */
import { ArrBaseClient } from "./base-client.js";
import type { RadarrMovie, RadarrQueueResponse, ArrStatusResult } from "./types.js";

export class RadarrClient extends ArrBaseClient {
  /** Fetch all monitored movies from Radarr. */
  async getMovies(): Promise<RadarrMovie[]> {
    return this.get<RadarrMovie[]>("/movie");
  }

  /** Fetch a single movie by Radarr ID. */
  async getMovie(id: number): Promise<RadarrMovie> {
    return this.get<RadarrMovie>(`/movie/${id}`);
  }

  /** Fetch the download queue. */
  async getQueue(): Promise<RadarrQueueResponse> {
    return this.get<RadarrQueueResponse>("/queue?includeMovie=true");
  }

  /**
   * Get the status of a movie by TMDB ID.
   * Fetches all movies and queue, then matches by tmdbId.
   */
  async getMovieStatus(tmdbId: number): Promise<ArrStatusResult> {
    const [movies, queue] = await Promise.all([this.getMovies(), this.getQueue()]);

    const movie = movies.find((m) => m.tmdbId === tmdbId);

    if (!movie) {
      return { status: "not_found", label: "Not in Radarr" };
    }

    // Check download queue
    const queueItem = queue.records.find((r) => r.movieId === movie.id);
    if (queueItem) {
      const progress =
        queueItem.size > 0
          ? Math.round(((queueItem.size - queueItem.sizeleft) / queueItem.size) * 100)
          : 0;
      return {
        status: "downloading",
        label: `Downloading ${progress}%`,
        progress,
      };
    }

    if (movie.hasFile) {
      return { status: "available", label: "Available" };
    }

    if (movie.monitored) {
      return { status: "monitored", label: "Monitored" };
    }

    return { status: "unmonitored", label: "Unmonitored" };
  }
}
