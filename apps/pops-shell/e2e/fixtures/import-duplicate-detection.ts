/**
 * CSV fixtures for import duplicate detection e2e test (#2122).
 *
 * Strategy: seeded transactions in the e2e database have NULL `checksum`
 * columns, so checksum-based dedup will never match them directly. Instead we
 * run two imports in the same test run:
 *
 *   1. CSV A — 3 new rows committed. After commit each row exists in the DB
 *      with a concrete checksum (SHA-256 of the raw CSV row JSON).
 *   2. CSV B — 2 rows that are BYTE-EQUAL to rows from CSV A plus 1 unique
 *      new row. Papa.parse serialises both CSVs with `header: true`, so
 *      identical row text produces identical row objects and identical
 *      checksums. The 2 duplicate rows land in Skipped; the 1 new row lands
 *      in Matched/Uncertain.
 *
 * Each test run deletes and re-creates the isolated environment, so the
 * committed rows from a previous run do not leak across runs.
 *
 * Descriptions mix a Woolworths alias-match (so the row lands in Matched
 * without any manual resolution) with distinctive strings that can be
 * asserted on the Skipped tab.
 */

/**
 * Every row description starts with "WOOLWORTHS METRO" so the backend
 * alias-matcher (case-insensitive contains on the seeded `Woolworths Metro`
 * alias) classifies every non-duplicate row as Matched. This keeps the test
 * focused on duplicate detection — no Uncertain-row resolution needed before
 * commit.
 */
const DUP_ROWS = [
  '10/02/2026,WOOLWORTHS METRO DUP-A,11.11',
  '11/02/2026,WOOLWORTHS METRO DUP-B,22.22',
] as const;

const SEED_ONLY_ROW = '12/02/2026,WOOLWORTHS METRO SEED-ONLY,33.33';
const REUPLOAD_ONLY_ROW = '13/02/2026,WOOLWORTHS METRO REUPLOAD-ONLY,44.44';

/** First import — seeds 3 transactions with known checksums in the DB. */
export const duplicateDetectionCsvSeed = `Date,Description,Amount
${DUP_ROWS[0]}
${DUP_ROWS[1]}
${SEED_ONLY_ROW}`;

/**
 * Second import — the two DUP rows are byte-identical to CSV A (so they
 * will collide on checksum and be skipped); the reupload-only row is unique
 * and must be classified as Matched (via Woolworths alias).
 */
export const duplicateDetectionCsvReupload = `Date,Description,Amount
${DUP_ROWS[0]}
${DUP_ROWS[1]}
${REUPLOAD_ONLY_ROW}`;

export const duplicateDetectionDescriptors = {
  dupA: 'WOOLWORTHS METRO DUP-A',
  dupB: 'WOOLWORTHS METRO DUP-B',
  seedOnly: 'WOOLWORTHS METRO SEED-ONLY',
  reuploadOnly: 'WOOLWORTHS METRO REUPLOAD-ONLY',
} as const;
