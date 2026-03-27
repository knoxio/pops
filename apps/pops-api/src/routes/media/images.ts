/**
 * Express route for serving cached media images.
 *
 * GET /media/images/:mediaType/:id/:filename
 *
 * Serves locally cached images with immutable cache headers.
 * Checks for override file first when requesting posters.
 * Returns 404 on cache miss (on-demand download is a follow-up).
 */
import { type Router as ExpressRouter, Router } from "express";
import { stat } from "node:fs/promises";
import { join, resolve, extname } from "node:path";
import { createHash } from "node:crypto";
import { MEDIA_DIR_NAMES } from "../../modules/media/tmdb/image-cache.js";
import { getImageCache } from "../../modules/media/tmdb/index.js";
import { getDb } from "../../db.js";

const VALID_MEDIA_TYPES = ["movie", "tv"] as const;
const VALID_FILENAMES = ["poster.jpg", "backdrop.jpg", "logo.png", "override.jpg"] as const;
type ValidFilename = (typeof VALID_FILENAMES)[number];

/** Season poster filenames follow the pattern season_{N}.jpg. */
const SEASON_POSTER_RE = /^season_\d+\.jpg$/;

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
};

const CACHE_CONTROL = "public, max-age=31536000, immutable";

function getImagesDir(): string {
  const dir = process.env.MEDIA_IMAGES_DIR ?? "./data/media/images";
  return resolve(dir); // Return absolute path
}

const router: ExpressRouter = Router();

router.get("/media/images/:mediaType/:id/:filename", async (req, res): Promise<void> => {
  const { mediaType, id, filename } = req.params;

  // Validate mediaType
  if (!VALID_MEDIA_TYPES.includes(mediaType as (typeof VALID_MEDIA_TYPES)[number])) {
    res.status(400).json({ error: `Invalid media type: ${mediaType}` });
    return;
  }

  // Validate id is numeric
  if (!/^\d+$/.test(id)) {
    res.status(400).json({ error: `Invalid id: ${id}` });
    return;
  }

  // Validate filename
  if (!VALID_FILENAMES.includes(filename as ValidFilename) && !SEASON_POSTER_RE.test(filename)) {
    res.status(400).json({ error: `Invalid filename: ${filename}` });
    return;
  }

  const imagesDir = getImagesDir();
  const mediaDirName = MEDIA_DIR_NAMES[mediaType] ?? `${mediaType}s`;
  const mediaDir = join(imagesDir, mediaDirName, id);

  // Path traversal defense: ensure resolved path stays within imagesDir
  const resolvedDir = resolve(mediaDir);
  if (!resolvedDir.startsWith(resolve(imagesDir))) {
    res.status(400).json({ error: "Invalid path" });
    return;
  }

  // Override resolution: if requesting poster.jpg, check for override.jpg first
  if (filename === "poster.jpg") {
    const overridePath = join(mediaDir, "override.jpg");
    const served = await tryServeFile(overridePath, res);
    if (served) return;
  }

  // Serve the requested file
  const filePath = join(mediaDir, filename);
  const served = await tryServeFile(filePath, res);
  if (served) return;

  // Cache miss — try to redirect to original source
  try {
    const db = getDb();
    const table = mediaType === "movie" ? "movies" : "tv_shows";
    const idColumn = mediaType === "movie" ? "tmdb_id" : "tvdb_id";
    const titleColumn = mediaType === "movie" ? "title" : "name";
    const pathColumn = filename.startsWith("poster")
      ? "poster_path"
      : filename.startsWith("logo")
        ? "logo_path"
        : "backdrop_path";

    const record = db
      .prepare(
        `SELECT ${pathColumn} AS path, ${titleColumn} AS title FROM ${table} WHERE ${idColumn} = ?`
      )
      .get(id) as { path: string | null; title: string | null } | undefined;

    if (record?.path) {
      const originalPath = record.path;

      if (originalPath.startsWith("http")) {
        res.redirect(originalPath);
        return;
      } else if (originalPath.startsWith("/")) {
        // Assume TMDB
        const size = filename.startsWith("poster") ? "w780" : "w1280";
        res.redirect(`https://image.tmdb.org/t/p/${size}${originalPath}`);
        return;
      }
    }

    // Generate placeholder as final fallback for poster requests
    if (filename === "poster.jpg" && record?.title) {
      const imageCache = getImageCache();
      if (mediaType === "movie") {
        await imageCache.generatePlaceholder(Number(id), record.title);
      } else {
        await imageCache.generateTvPlaceholder(Number(id), record.title);
      }
      const served = await tryServeFile(filePath, res);
      if (served) return;
    }
  } catch (err) {
    console.error("[Images] Fallback failed:", err);
  }

  // Final 404 if no fallback available
  res.status(404).json({ error: "Image not found" });
});

/**
 * Try to serve a file with cache headers.
 * Returns true if the file was served, false if it doesn't exist.
 */
async function tryServeFile(filePath: string, res: import("express").Response): Promise<boolean> {
  try {
    const fileStat = await stat(filePath);
    const ext = extname(filePath);
    const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";

    // Generate ETag from mtime + size
    const etag = createHash("md5").update(`${fileStat.mtimeMs}-${fileStat.size}`).digest("hex");

    res.set({
      "Content-Type": contentType,
      "Cache-Control": CACHE_CONTROL,
      ETag: `"${etag}"`,
    });

    // Check If-None-Match for conditional requests
    const ifNoneMatch = res.req.get("If-None-Match");
    if (ifNoneMatch === `"${etag}"`) {
      res.status(304).end();
      return true;
    }

    res.sendFile(resolve(filePath)); // Ensure absolute path
    return true;
  } catch {
    return false;
  }
}

export default router;
