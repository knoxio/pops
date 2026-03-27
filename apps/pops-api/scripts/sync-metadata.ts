/**
 * Metadata and Image Sync script.
 * Fetches real metadata from TMDB/TheTVDB for all items in the database,
 * updates their paths, and downloads images to the local cache.
 *
 * Run with: tsx scripts/sync-metadata.ts
 */
import "dotenv/config";
import { getDb } from "../src/db.js";
import { getTmdbClient, ImageCacheService } from "../src/modules/media/tmdb/index.js";
import { getTvdbClient } from "../src/modules/media/thetvdb/index.js";
import { selectBestArtwork } from "../src/modules/media/library/tv-show-service.js";

async function main() {
  const db = getDb();
  const tmdbClient = getTmdbClient();
  const tvdbClient = getTvdbClient();

  const imagesDir = process.env.MEDIA_IMAGES_DIR ?? "./data/media/images";
  const cacheService = new ImageCacheService(imagesDir);

  if (!tmdbClient) {
    console.error("❌ TMDB_API_KEY not set in environment");
    process.exit(1);
  }

  if (!tvdbClient) {
    console.error("❌ THETVDB_API_KEY not set in environment");
    process.exit(1);
  }

  console.log(`\n🚀 Media Metadata & Image Sync`);
  console.log(`📂 Cache directory: ${imagesDir}`);

  // 1. Sync Movies
  const movies = db.prepare("SELECT id, tmdb_id, title FROM movies").all() as any[];
  console.log(`\n🎬 Syncing ${movies.length} movies...`);

  for (const movie of movies) {
    process.stdout.write(`  → ${movie.title}... `);
    try {
      // Fetch fresh detail
      const detail = await tmdbClient.getMovie(movie.tmdb_id);

      // Update DB
      db.prepare(
        `
        UPDATE movies SET 
          poster_path = ?, 
          backdrop_path = ?,
          genres = ?,
          tagline = ?,
          runtime = ?,
          status = ?
        WHERE id = ?
      `
      ).run(
        detail.posterPath,
        detail.backdropPath,
        JSON.stringify(detail.genres.map((g) => g.name)),
        detail.tagline,
        detail.runtime,
        detail.status,
        movie.id
      );

      // Download images
      await cacheService.downloadMovieImages(
        movie.tmdb_id,
        detail.posterPath,
        detail.backdropPath,
        null
      );

      console.log("✅");
    } catch (err) {
      console.log("❌");
      console.error(`    Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 2. Sync TV Shows
  const shows = db.prepare("SELECT id, tvdb_id, name FROM tv_shows").all() as any[];
  console.log(`\n📺 Syncing ${shows.length} TV shows...`);

  for (const show of shows) {
    process.stdout.write(`  → ${show.name}... `);
    try {
      // Fetch extended detail
      const detail = await tvdbClient.getSeriesExtended(show.tvdb_id);

      // Select artwork
      const { posterUrl, backdropUrl } = selectBestArtwork(detail.artworks);

      // Update DB
      db.prepare(
        `
        UPDATE tv_shows SET 
          poster_path = ?, 
          backdrop_path = ?,
          genres = ?,
          status = ?,
          number_of_seasons = ?,
          number_of_episodes = ?
        WHERE id = ?
      `
      ).run(
        posterUrl,
        backdropUrl,
        JSON.stringify(detail.genres.map((g) => g.name)),
        detail.status,
        detail.seasons.filter((s) => s.seasonNumber > 0).length,
        detail.seasons.reduce((sum, s) => sum + s.episodeCount, 0),
        show.id
      );

      // Download images
      await cacheService.downloadTvShowImages(show.tvdb_id, posterUrl, backdropUrl);

      console.log("✅");
    } catch (err) {
      console.log("❌");
      console.error(`    Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log("\n✨ Sync complete!\n");
  db.close();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
