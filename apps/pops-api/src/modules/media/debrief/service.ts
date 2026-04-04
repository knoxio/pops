/**
 * Debrief service — auto-queue and manage post-watch debrief sessions.
 */
import { eq, and, inArray, asc } from "drizzle-orm";
import { getDrizzle } from "../../../db.js";
import {
  debriefSessions,
  debriefResults,
  debriefStatus,
  watchHistory,
  comparisonDimensions,
  movies,
} from "@pops/db-types";
import { getDebriefOpponent } from "../comparisons/service.js";
import { NotFoundError } from "../../../shared/errors.js";

/**
 * Create a pending debrief session for a watch history entry.
 * If the same media already has pending/active sessions (from a previous watch),
 * those are deleted first (re-watch resets debrief state).
 *
 * Returns the new session ID.
 */
export function createDebriefSession(watchHistoryId: number): number {
  const db = getDrizzle();

  // Look up the watch history entry to find media info
  const entry = db.select().from(watchHistory).where(eq(watchHistory.id, watchHistoryId)).get();
  if (!entry) {
    throw new Error(`Watch history entry ${watchHistoryId} not found`);
  }

  // Find and delete any existing pending/active sessions for this same media
  // (re-watch resets debrief state)
  const existingWatchIds = db
    .select({ id: watchHistory.id })
    .from(watchHistory)
    .where(
      and(eq(watchHistory.mediaType, entry.mediaType), eq(watchHistory.mediaId, entry.mediaId))
    )
    .all()
    .map((r) => r.id);

  if (existingWatchIds.length > 0) {
    db.delete(debriefSessions)
      .where(
        and(
          inArray(debriefSessions.watchHistoryId, existingWatchIds),
          inArray(debriefSessions.status, ["pending", "active"])
        )
      )
      .run();
  }

  // Create new pending session
  const result = db.insert(debriefSessions).values({ watchHistoryId, status: "pending" }).run();

  return Number(result.lastInsertRowid);
}

/** Response shape for a debrief dimension entry. */
export interface DebriefDimension {
  dimensionId: number;
  name: string;
  status: "pending" | "complete";
  comparisonId: number | null;
  opponent: {
    id: number;
    title: string;
    posterPath: string | null;
    posterUrl: string | null;
  } | null;
}

/** Response shape for the getDebrief endpoint. */
export interface DebriefResponse {
  sessionId: number;
  status: "pending" | "active" | "complete";
  movie: {
    mediaType: string;
    mediaId: number;
    title: string;
    posterPath: string | null;
    posterUrl: string | null;
  };
  dimensions: DebriefDimension[];
}

/**
 * Get a debrief session with movie info, dimensions, and opponents.
 *
 * For each active dimension:
 *  - If a debrief_result exists for that dimension → status = "complete"
 *  - Otherwise → status = "pending", opponent fetched via getDebriefOpponent
 *
 * If the session is "pending", transitions it to "active" on first read.
 */
export function getDebrief(sessionId: number): DebriefResponse {
  const db = getDrizzle();

  // Fetch session
  const session = db.select().from(debriefSessions).where(eq(debriefSessions.id, sessionId)).get();
  if (!session) {
    throw new NotFoundError("Debrief session", String(sessionId));
  }

  // Fetch watch history entry
  const watchEntry = db
    .select()
    .from(watchHistory)
    .where(eq(watchHistory.id, session.watchHistoryId))
    .get();
  if (!watchEntry) {
    throw new NotFoundError("Watch history entry", String(session.watchHistoryId));
  }

  // Fetch movie metadata
  const movieRow = db
    .select({
      id: movies.id,
      title: movies.title,
      posterPath: movies.posterPath,
      tmdbId: movies.tmdbId,
      posterOverridePath: movies.posterOverridePath,
    })
    .from(movies)
    .where(eq(movies.id, watchEntry.mediaId))
    .get();
  if (!movieRow) {
    throw new NotFoundError("Movie", String(watchEntry.mediaId));
  }

  const posterUrl = movieRow.posterOverridePath
    ? movieRow.posterOverridePath
    : movieRow.posterPath
      ? `/media/images/movie/${movieRow.tmdbId}/poster.jpg`
      : null;

  // Get active dimensions
  const dims = db
    .select()
    .from(comparisonDimensions)
    .where(eq(comparisonDimensions.active, 1))
    .orderBy(asc(comparisonDimensions.sortOrder))
    .all();

  // Get completed debrief results for this session
  const results = db
    .select()
    .from(debriefResults)
    .where(eq(debriefResults.sessionId, sessionId))
    .all();
  const completedByDimension = new Map(results.map((r) => [r.dimensionId, r.comparisonId]));

  // Build dimensions array
  const dimensions: DebriefDimension[] = dims.map((dim) => {
    const completed = completedByDimension.has(dim.id);
    if (completed) {
      return {
        dimensionId: dim.id,
        name: dim.name,
        status: "complete" as const,
        comparisonId: completedByDimension.get(dim.id) ?? null,
        opponent: null,
      };
    }

    // Fetch opponent for pending dimension
    const opponent = getDebriefOpponent(watchEntry.mediaType, watchEntry.mediaId, dim.id);
    return {
      dimensionId: dim.id,
      name: dim.name,
      status: "pending" as const,
      comparisonId: null,
      opponent,
    };
  });

  // Transition pending → active on first read
  let currentStatus = session.status;
  if (currentStatus === "pending") {
    db.update(debriefSessions)
      .set({ status: "active" })
      .where(eq(debriefSessions.id, sessionId))
      .run();
    currentStatus = "active";
  }

  return {
    sessionId: session.id,
    status: currentStatus,
    movie: {
      mediaType: watchEntry.mediaType,
      mediaId: watchEntry.mediaId,
      title: movieRow.title,
      posterPath: movieRow.posterPath,
      posterUrl,
    },
    dimensions,
  };
}

/**
 * Queue debrief status rows for a media item — one per active dimension.
 *
 * On conflict (re-watch), resets debriefed and dismissed to 0 so the
 * user is prompted to debrief again.
 */
export function queueDebriefStatus(mediaType: string, mediaId: number): number {
  const db = getDrizzle();

  // Get all active dimensions
  const dims = db
    .select({ id: comparisonDimensions.id })
    .from(comparisonDimensions)
    .where(eq(comparisonDimensions.active, 1))
    .all();

  if (dims.length === 0) return 0;

  const now = new Date().toISOString();

  for (const dim of dims) {
    db.insert(debriefStatus)
      .values({
        mediaType,
        mediaId,
        dimensionId: dim.id,
      })
      .onConflictDoUpdate({
        target: [debriefStatus.mediaType, debriefStatus.mediaId, debriefStatus.dimensionId],
        set: {
          debriefed: 0,
          dismissed: 0,
          updatedAt: now,
        },
      })
      .run();
  }

  return dims.length;
}
