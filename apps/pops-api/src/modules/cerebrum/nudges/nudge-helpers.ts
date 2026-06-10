/**
 * Re-exports of the nudge_log row-mapping helpers.
 *
 * The canonical implementations live in `@pops/cerebrum-db`. This file
 * preserves the existing import path that the rest of the cerebrum
 * module reaches for, so the cutover is mechanical. Once every caller
 * has been redirected to import from the package directly (PR 4
 * onwards), this file is deleted.
 */
export { generateNudgeId, rowToNudge, type NudgeLogRow } from '@pops/cerebrum-db';
