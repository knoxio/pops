import { count } from 'drizzle-orm';

import { comparisons } from '@pops/media-db';

import { getMediaDrizzle } from '../../../db/media-db-handle.js';

export function getGlobalComparisonCount(): number {
  const db = getMediaDrizzle();
  const row = db.select({ cnt: count() }).from(comparisons).get();
  return row?.cnt ?? 0;
}
