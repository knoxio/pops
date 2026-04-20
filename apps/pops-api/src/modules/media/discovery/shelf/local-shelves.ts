/**
 * Local library shelf implementations split into focused modules.
 *
 * Importing this module triggers self-registration of all 9 local shelves.
 */
export { shortWatchShelf, longEpicShelf } from './local-runtime-shelves.js';
export { comfortPicksShelf, recentlyAddedShelf, undiscoveredShelf } from './local-watch-shelves.js';
export { friendProofShelf, polarizingShelf } from './local-score-shelves.js';
export { franchiseCompletionsShelf, leavingSoonShelf } from './local-misc-shelves.js';
