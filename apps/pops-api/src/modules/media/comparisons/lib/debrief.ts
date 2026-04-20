/**
 * Debrief lib — re-exports of opponent selection, pending sessions,
 * dismiss, and record-comparison helpers.
 *
 * Implementation lives in:
 *  - debrief-opponent.ts — selecting the next opponent
 *  - debrief-pending.ts  — listing pending sessions
 *  - debrief-dismiss.ts  — dismissing a debrief dimension
 *  - debrief-record.ts   — recording a debrief comparison
 */
export { getDebriefOpponent } from './debrief-opponent.js';
export { getPendingDebriefs } from './debrief-pending.js';
export { dismissDebriefDimension } from './debrief-dismiss.js';
export { recordDebriefComparison } from './debrief-record.js';
