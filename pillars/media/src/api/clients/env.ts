/**
 * Pillar-local environment access for the upstream metadata clients.
 *
 * The media pillar must not depend on `core/settings` or `apps/pops-api`,
 * so the TMDB / TheTVDB clients read their API keys and tuning knobs
 * straight from `process.env` via these helpers instead of the monolith's
 * `env.ts` / settings table.
 */

/** Read an env var, returning `undefined` when unset or empty. */
export function getEnv(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === '' ? undefined : value;
}

/** Read a required env var, throwing a clear error when unset or empty. */
export function requireEnv(name: string): string {
  const value = getEnv(name);
  if (value === undefined) {
    throw new Error(
      `${name} is not configured. Set it in .env (development) or Docker secrets (production).`
    );
  }
  return value;
}

/**
 * Read an integer env var, falling back to `fallback` when the value is
 * unset, empty, or not a finite integer.
 */
export function getEnvInt(name: string, fallback: number): number {
  const raw = getEnv(name);
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Default location for the local media-image cache. */
const DEFAULT_MEDIA_IMAGES_DIR = './data/media/images';

/**
 * Root directory the media-image cache reads from and writes to. The byte
 * route serving `/media/images/...` and the image-cache downloader must agree
 * on this path, so both resolve it through here.
 */
export function getMediaImagesDir(): string {
  return getEnv('MEDIA_IMAGES_DIR') ?? DEFAULT_MEDIA_IMAGES_DIR;
}
