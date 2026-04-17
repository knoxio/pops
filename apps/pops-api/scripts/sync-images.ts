/**
 * Utility script to sync media images from TMDB/TheTVDB to local cache.
 * Iterates through all movies and TV shows in the database and downloads
 * posters and backdrops if they are missing from the cache.
 *
 * Run with: tsx scripts/sync-images.ts
 */
import 'dotenv/config';

import { getDb } from '../src/db.js';
import { ImageCacheService } from '../src/modules/media/tmdb/index.js';
import { TokenBucketRateLimiter } from '../src/modules/media/tmdb/rate-limiter.js';

async function main() {
  const db = getDb();
  const imagesDir = process.env.MEDIA_IMAGES_DIR ?? './data/media/images';
  const rateLimiter = new TokenBucketRateLimiter(40, 4);
  const cacheService = new ImageCacheService(imagesDir, rateLimiter);

  console.log(`\n🖼️  Media Image Sync`);
  console.log(`📂 Cache directory: ${imagesDir}`);

  // 1. Sync Movies
  const movies = db
    .prepare('SELECT tmdb_id, title, poster_path, backdrop_path FROM movies')
    .all() as Array<{
    tmdb_id: number;
    title: string;
    poster_path: string | null;
    backdrop_path: string | null;
  }>;
  console.log(`\n🎬 Syncing ${movies.length} movies...`);

  for (const movie of movies) {
    process.stdout.write(`  → ${movie.title}... `);
    try {
      await cacheService.downloadMovieImages(
        movie.tmdb_id,
        movie.poster_path,
        movie.backdrop_path,
        null // logo_path
      );
      console.log('✅');
    } catch (err) {
      console.log('❌');
      console.error(`    Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 2. Sync TV Shows
  const shows = db
    .prepare('SELECT tvdb_id, name, poster_path, backdrop_path FROM tv_shows')
    .all() as Array<{
    tvdb_id: number;
    name: string;
    poster_path: string | null;
    backdrop_path: string | null;
  }>;
  console.log(`\n📺 Syncing ${shows.length} TV shows...`);

  for (const show of shows) {
    process.stdout.write(`  → ${show.name}... `);
    try {
      await cacheService.downloadTvShowImages(show.tvdb_id, show.poster_path, show.backdrop_path);
      console.log('✅');
    } catch (err) {
      console.log('❌');
      console.error(`    Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log('\n✨ Image sync complete!\n');
  db.close();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
