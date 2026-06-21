export interface LogDetails {
  marked?: { tmdbId: number; title: string }[];
  removed?: { tmdbId: number; title: string }[];
  added?: { tmdbId: number; title: string }[];
  failed?: { tmdbId: number; title: string; error?: string }[];
}

export interface LogEntryData {
  id: number;
  executedAt: string;
  moviesMarkedLeaving: number;
  moviesRemoved: number;
  moviesAdded: number;
  removalsFailed: number;
  freeSpaceGb: number;
  targetFreeGb: number;
  skippedReason: string | null;
  details: string | null;
}

export function parseDetails(raw: string | null): LogDetails | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LogDetails;
  } catch {
    return null;
  }
}
