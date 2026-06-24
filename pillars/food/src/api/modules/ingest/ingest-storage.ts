/**
 * Screenshot-payload disk writer.
 *
 * For `kind='screenshot'` the API decodes the base64 payload to
 * `${FOOD_INGEST_DIR}/<sourceId>/screenshot.<ext>` BEFORE the BullMQ job is
 * enqueued (Redis stays small; worker reads the file).
 *
 * Mime → extension mapping allows jpg/jpeg/png/webp. Caller validates the
 * mime against the input schema; this helper just maps.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const SCREENSHOT_MAX_BYTES = 8 * 1024 * 1024;

/** Mirror of the ingest path layout in `pillars/food/app/src/storage/ingest-paths.ts`; duplicated so the API does not depend on the app package. */
const DEFAULT_FOOD_INGEST_DIR = './data/food/ingest';

function ingestRootDir(): string {
  const configured = process.env['FOOD_INGEST_DIR'];
  const raw = configured && configured.length > 0 ? configured : DEFAULT_FOOD_INGEST_DIR;
  return resolve(raw);
}

export function ingestDirFor(sourceId: number): string {
  return resolve(ingestRootDir(), String(sourceId));
}

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function extensionForMimeType(mimeType: string): string {
  const ext = MIME_TO_EXT[mimeType];
  if (ext === undefined) {
    throw new Error(`Unsupported screenshot mime type "${mimeType}"`);
  }
  return ext;
}

export interface WriteScreenshotResult {
  /** Absolute filesystem path written to. */
  absolutePath: string;
  /** Path relative to `FOOD_INGEST_DIR` — what gets stored in the BullMQ job. */
  relativeContentPath: string;
  /** Bytes written; matches the decoded payload size. */
  bytesWritten: number;
}

/**
 * Decode and persist a screenshot payload. Throws when the decoded size
 * exceeds `SCREENSHOT_MAX_BYTES` or when the mime type isn't supported.
 *
 * Files are written under `<FOOD_INGEST_DIR>/<sourceId>/screenshot.<ext>`
 * so the FIFO eviction (`runEvictionTick`) sweeps them alongside the
 * other per-source media when the directory cap is hit.
 */
export function writeScreenshotPayload(
  sourceId: number,
  mimeType: string,
  contentBase64: string
): WriteScreenshotResult {
  const ext = extensionForMimeType(mimeType);
  // Trim the data-URI prefix if the caller sent the raw `data:image/png;base64,...`
  // header — be permissive on input, strict on output.
  const cleaned = contentBase64.replace(/^data:[^;]+;base64,/, '');
  // Pre-decode size check — base64 encodes ~4/3 bytes per source byte, so a
  // cleaned payload longer than this can't decode to ≤ SCREENSHOT_MAX_BYTES.
  // Without the pre-check, `Buffer.from(huge_string, 'base64')` would
  // allocate the full decoded buffer before we can reject it.
  const maxBase64Chars = Math.ceil((SCREENSHOT_MAX_BYTES * 4) / 3);
  if (cleaned.length > maxBase64Chars) {
    throw new Error(
      `Screenshot base64 payload (${cleaned.length} chars) exceeds the pre-decode cap (${maxBase64Chars} chars) for ${SCREENSHOT_MAX_BYTES} bytes`
    );
  }
  const buffer = Buffer.from(cleaned, 'base64');
  if (buffer.length > SCREENSHOT_MAX_BYTES) {
    throw new Error(
      `Screenshot payload (${buffer.length} bytes) exceeds cap (${SCREENSHOT_MAX_BYTES} bytes)`
    );
  }
  const dir = ingestDirFor(sourceId);
  mkdirSync(dir, { recursive: true });
  const filename = `screenshot.${ext}`;
  const absolutePath = `${dir}/${filename}`;
  writeFileSync(absolutePath, buffer);
  // Stored in the BullMQ job verbatim. Worker resolves via `ingestRootDir()`.
  const relativeContentPath = `${sourceId}/${filename}`;
  return { absolutePath, relativeContentPath, bytesWritten: buffer.length };
}
