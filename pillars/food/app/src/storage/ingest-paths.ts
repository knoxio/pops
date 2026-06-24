/**
 * Filesystem helpers for the food ingest media root. The ingest root is
 * configured via `FOOD_INGEST_DIR` and defaults to `./data/food/ingest`.
 * Path columns in `ingest_sources` are stored relative to the root so
 * deployments can relocate without rewriting rows.
 *
 * Returned paths use the platform-native separator; stored relative paths
 * use POSIX separators for readability in JSON exports.
 * `relativeToIngestDir` normalises either input.
 */
import { isAbsolute, relative, resolve, sep } from 'node:path';

/** Hard-coded default for `FOOD_INGEST_DIR`. */
export const DEFAULT_FOOD_INGEST_DIR = './data/food/ingest';

/**
 * Resolve the configured ingest root to an absolute path. Reads
 * `FOOD_INGEST_DIR` each call so tests can stub the env per-case.
 */
export function ingestRootDir(): string {
  const configured = process.env['FOOD_INGEST_DIR'];
  const raw = configured && configured.length > 0 ? configured : DEFAULT_FOOD_INGEST_DIR;
  return resolve(raw);
}

/**
 * Absolute path to the per-source subdirectory. Callers create it lazily
 * — the eviction job and the ingest worker both depend on `mkdir -p`
 * semantics rather than this helper.
 */
export function ingestDirFor(sourceId: number): string {
  return resolve(ingestRootDir(), String(sourceId));
}

/**
 * Convert an absolute path under `${FOOD_INGEST_DIR}` into the relative
 * form stored in `ingest_sources` path columns. Throws when the input
 * escapes the configured root — guards against accidentally persisting a
 * `../../etc/passwd` style traversal.
 *
 * Always returns POSIX-style separators so the value reads identically on
 * macOS, Linux, and Windows clients.
 */
export function relativeToIngestDir(absolutePath: string): string {
  if (!isAbsolute(absolutePath)) {
    throw new Error(`relativeToIngestDir requires an absolute path; received "${absolutePath}"`);
  }
  const root = ingestRootDir();
  const rel = relative(root, absolutePath);
  // The relative path escapes the root iff it's empty (input === root), is
  // exactly `..`, starts with a `..` path segment (`../` or `..<sep>`), or
  // is itself absolute (Windows cross-drive case where `path.relative`
  // returns an absolute path). A literal `..foo` filename is NOT a
  // traversal — only treat `..` as a parent ref when it's a whole segment.
  const looksLikeTraversal = rel === '..' || rel.startsWith('../') || rel.startsWith(`..${sep}`);
  if (rel.length === 0 || looksLikeTraversal || isAbsolute(rel)) {
    throw new Error(`Path "${absolutePath}" is outside FOOD_INGEST_DIR (${root})`);
  }
  return sep === '/' ? rel : rel.split(sep).join('/');
}
