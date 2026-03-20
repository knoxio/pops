/**
 * Media image cache service — downloads and caches images locally.
 *
 * Movie images: {MEDIA_IMAGES_DIR}/movies/{tmdb_id}/ (via TMDB with size prefixes)
 * TV images:    {MEDIA_IMAGES_DIR}/tv/{tvdb_id}/     (via TheTVDB full URLs)
 *
 * Downloads concurrently. Skips null paths and existing files.
 * Failures are logged, not thrown.
 */
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

const IMAGE_SIZES = {
  poster: "w780",
  backdrop: "w1280",
  logo: "w500",
} as const;

const IMAGE_FILENAMES = {
  poster: "poster.jpg",
  backdrop: "backdrop.jpg",
  logo: "logo.png",
  override: "override.jpg",
} as const;

export type ImageType = keyof typeof IMAGE_FILENAMES;

export class ImageCacheService {
  constructor(private readonly imagesDir: string) {}

  /**
   * Download movie images from TMDB to local cache.
   * Skips null paths and files that already exist.
   * Downloads concurrently; individual failures are logged but don't throw.
   */
  async downloadMovieImages(
    tmdbId: number,
    posterPath: string | null,
    backdropPath: string | null,
    logoPath: string | null,
  ): Promise<void> {
    const movieDir = this.movieDir(tmdbId);
    await mkdir(movieDir, { recursive: true });

    const downloads: Promise<void>[] = [];

    if (posterPath) {
      downloads.push(
        this.downloadImage(
          `${TMDB_IMAGE_BASE}/${IMAGE_SIZES.poster}${posterPath}`,
          join(movieDir, IMAGE_FILENAMES.poster),
        ),
      );
    }

    if (backdropPath) {
      downloads.push(
        this.downloadImage(
          `${TMDB_IMAGE_BASE}/${IMAGE_SIZES.backdrop}${backdropPath}`,
          join(movieDir, IMAGE_FILENAMES.backdrop),
        ),
      );
    }

    if (logoPath) {
      downloads.push(
        this.downloadImage(
          `${TMDB_IMAGE_BASE}/${IMAGE_SIZES.logo}${logoPath}`,
          join(movieDir, IMAGE_FILENAMES.logo),
        ),
      );
    }

    if (downloads.length > 0) {
      await Promise.allSettled(downloads);
    }
  }

  /**
   * Download TV show images from TheTVDB to local cache.
   * TheTVDB provides full URLs (no size prefix needed).
   * Skips null URLs and files that already exist.
   */
  async downloadTvShowImages(
    tvdbId: number,
    posterUrl: string | null,
    backdropUrl: string | null,
  ): Promise<void> {
    const tvDir = this.tvShowDir(tvdbId);
    await mkdir(tvDir, { recursive: true });

    const downloads: Promise<void>[] = [];

    if (posterUrl) {
      downloads.push(
        this.downloadImage(posterUrl, join(tvDir, IMAGE_FILENAMES.poster)),
      );
    }

    if (backdropUrl) {
      downloads.push(
        this.downloadImage(backdropUrl, join(tvDir, IMAGE_FILENAMES.backdrop)),
      );
    }

    if (downloads.length > 0) {
      await Promise.allSettled(downloads);
    }
  }

  /**
   * Get the absolute path to a cached image file.
   * Returns null if the file doesn't exist.
   */
  async getImagePath(
    mediaType: "movie" | "tv",
    id: number,
    imageType: ImageType,
  ): Promise<string | null> {
    const dirName = mediaType === "tv" ? "tv" : "movies";
    const filePath = join(
      this.imagesDir,
      dirName,
      String(id),
      IMAGE_FILENAMES[imageType],
    );

    try {
      await stat(filePath);
      return filePath;
    } catch {
      return null;
    }
  }

  /** Delete all cached images for a movie. */
  async deleteMovieImages(tmdbId: number): Promise<void> {
    const movieDir = this.movieDir(tmdbId);
    await rm(movieDir, { recursive: true, force: true });
  }

  /** Delete all cached images for a TV show. */
  async deleteTvShowImages(tvdbId: number): Promise<void> {
    const tvDir = this.tvShowDir(tvdbId);
    await rm(tvDir, { recursive: true, force: true });
  }

  private movieDir(tmdbId: number): string {
    return join(this.imagesDir, "movies", String(tmdbId));
  }

  private tvShowDir(tvdbId: number): string {
    return join(this.imagesDir, "tv", String(tvdbId));
  }

  private async downloadImage(url: string, destPath: string): Promise<void> {
    // Skip if file already exists
    try {
      await stat(destPath);
      return;
    } catch {
      // File doesn't exist — proceed with download
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      await writeFile(destPath, buffer);
    } catch (err) {
      // Log but don't throw — missing images are not fatal
      console.warn(
        `[ImageCache] Failed to download ${url}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
