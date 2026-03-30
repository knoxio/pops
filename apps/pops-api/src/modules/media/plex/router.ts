/**
 * Plex tRPC router — sync operations and connection management.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, inArray } from "drizzle-orm";
import { settings } from "@pops/db-types";
import { router, protectedProcedure } from "../../../trpc.js";
import { PlexApiError } from "./types.js";
import { PlexClient } from "./client.js";
import * as plexService from "./service.js";
import * as scheduler from "./scheduler.js";
import { importMoviesFromPlex } from "./sync-movies.js";
import { importTvShowsFromPlex } from "./sync-tv.js";
import { syncWatchlistFromPlex } from "./sync-watchlist.js";
import { syncWatchHistoryFromPlex } from "./sync-watch-history.js";
import { syncDiscoverWatches } from "./sync-discover-watches.js";
import { getDrizzle } from "../../../db.js";

function requirePlexClient(): PlexClient {
  const client = plexService.getPlexClient();
  if (!client) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Plex is not configured. Connect to Plex in settings first.",
    });
  }
  return client;
}

export const plexRouter = router({
  testConnection: protectedProcedure.query(async () => {
    const client = requirePlexClient();
    try {
      const connected = await plexService.testConnection(client);
      return { data: { connected } };
    } catch (err) {
      if (err instanceof PlexApiError) {
        return { data: { connected: false, error: err.message } };
      }
      throw err;
    }
  }),

  getLibraries: protectedProcedure.query(async () => {
    const client = requirePlexClient();
    try {
      const libraries = await client.getLibraries();
      return { data: libraries };
    } catch (err) {
      if (err instanceof PlexApiError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Plex API error: ${err.message}`,
        });
      }
      throw err;
    }
  }),

  syncMovies: protectedProcedure
    .input(z.object({ sectionId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const client = requirePlexClient();
      try {
        const result = await importMoviesFromPlex(client, input.sectionId);
        return {
          data: result,
          message: `Synced ${result.synced} movies (${result.skipped} skipped, ${result.errors.length} errors)`,
        };
      } catch (err) {
        if (err instanceof PlexApiError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Plex API error: ${err.message}`,
          });
        }
        throw err;
      }
    }),

  syncTvShows: protectedProcedure
    .input(z.object({ sectionId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const client = requirePlexClient();
      try {
        const result = await importTvShowsFromPlex(client, input.sectionId);
        return {
          data: result,
          message: `Synced ${result.synced} TV shows (${result.skipped} skipped, ${result.errors.length} errors)`,
        };
      } catch (err) {
        if (err instanceof PlexApiError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Plex API error: ${err.message}`,
          });
        }
        throw err;
      }
    }),

  syncWatchlist: protectedProcedure.mutation(async () => {
    requirePlexClient(); // Verify Plex is configured
    const token = plexService.getPlexToken();
    if (!token) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Plex token not available",
      });
    }
    try {
      const result = await syncWatchlistFromPlex(token);
      return {
        data: result,
        message: `Watchlist sync: ${result.added} added, ${result.removed} removed, ${result.skipped} skipped`,
      };
    } catch (err) {
      if (err instanceof PlexApiError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Plex API error: ${err.message}`,
        });
      }
      throw err;
    }
  }),

  syncWatchHistory: protectedProcedure
    .input(
      z.object({
        movieSectionId: z.string().min(1).optional(),
        tvSectionId: z.string().min(1).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const client = requirePlexClient();
      try {
        const result = await syncWatchHistoryFromPlex(
          client,
          input.movieSectionId,
          input.tvSectionId
        );
        return {
          data: result,
          message: `Watch history sync: ${result.summary.moviesLogged} movies, ${result.summary.episodesLogged} episodes logged`,
        };
      } catch (err) {
        if (err instanceof PlexApiError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Plex API error: ${err.message}`,
          });
        }
        throw err;
      }
    }),

  syncDiscoverWatches: protectedProcedure.mutation(async () => {
    const client = requirePlexClient();
    try {
      const result = await syncDiscoverWatches(client);
      const totalLogged = result.movies.logged + result.tvShows.logged;
      const totalWatched = result.movies.watched + result.tvShows.watched;
      return {
        data: result,
        message: `Discover sync: ${totalWatched} watched found, ${totalLogged} new watches logged`,
      };
    } catch (err) {
      if (err instanceof PlexApiError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Plex API error: ${err.message}`,
        });
      }
      throw err;
    }
  }),

  getSyncStatus: protectedProcedure.query(() => {
    const client = plexService.getPlexClient();
    return { data: plexService.getSyncStatus(client) };
  }),

  setUrl: protectedProcedure
    .input(z.object({ url: z.string().min(1) }))
    .mutation(async ({ input }) => {
      let finalUrl = input.url.trim();
      if (!finalUrl.startsWith("http://") && !finalUrl.startsWith("https://")) {
        finalUrl = `http://${finalUrl}`;
      }

      try {
        new URL(finalUrl);
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Invalid URL format. Please provide a valid address (e.g., http://192.168.1.100:32400)",
        });
      }

      const db = getDrizzle();
      const tokenRecord = db.select().from(settings).where(eq(settings.key, "plex_token")).get();
      const token = tokenRecord?.value;

      try {
        if (token) {
          console.log(`[Plex] Validating full connection to ${finalUrl}...`);
          const testClient = new PlexClient(finalUrl, token);
          await testClient.getLibraries();
        } else {
          console.log(`[Plex] Validating reachability for ${finalUrl}...`);
          const controller = new AbortController();
          const id = setTimeout(() => controller.abort(), 5000);

          try {
            const res = await fetch(`${finalUrl}/identity`, {
              signal: controller.signal,
              headers: { Accept: "application/json" },
            });
            if (!res.ok && res.status !== 401) {
              throw new Error(`Server responded with ${res.status}`);
            }
          } finally {
            clearTimeout(id);
          }
        }
      } catch (err) {
        console.error(`[Plex] Connection validation failed for ${finalUrl}:`, err);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Could not connect to Plex server at ${finalUrl}. Verify the address is correct and the server is reachable.`,
        });
      }

      console.log(`[Plex] Updating server URL to: ${finalUrl}`);
      db.insert(settings)
        .values({ key: "plex_url", value: finalUrl })
        .onConflictDoUpdate({ target: settings.key, set: { value: finalUrl } })
        .run();

      return { message: "Plex URL updated and validated" };
    }),

  getPlexUrl: protectedProcedure.query(() => {
    return { data: plexService.getPlexUrl() };
  }),

  startScheduler: protectedProcedure
    .input(
      z
        .object({
          intervalMs: z.number().int().positive().optional(),
          movieSectionId: z.string().min(1).optional(),
          tvSectionId: z.string().min(1).optional(),
        })
        .optional()
    )
    .mutation(({ input }) => {
      const status = scheduler.startScheduler(input ?? {});
      return { data: status };
    }),

  stopScheduler: protectedProcedure.mutation(() => {
    const status = scheduler.stopScheduler();
    return { data: status };
  }),

  getSchedulerStatus: protectedProcedure.query(() => {
    return { data: scheduler.getSchedulerStatus() };
  }),

  getSyncLogs: protectedProcedure
    .input(z.object({ limit: z.number().int().positive().max(100).optional() }).optional())
    .query(({ input }) => {
      return { data: scheduler.getSyncLogs(input?.limit ?? 20) };
    }),

  getSectionIds: protectedProcedure.query(() => {
    return { data: plexService.getPlexSectionIds() };
  }),

  saveSectionIds: protectedProcedure
    .input(
      z.object({
        movieSectionId: z.string().min(1).optional(),
        tvSectionId: z.string().min(1).optional(),
      })
    )
    .mutation(({ input }) => {
      plexService.savePlexSectionIds(input.movieSectionId, input.tvSectionId);
      return { message: "Section IDs saved" };
    }),

  getAuthPin: protectedProcedure.mutation(async () => {
    const clientId = plexService.getPlexClientId();
    const res = await fetch("https://plex.tv/api/v2/pins?strong=false", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "X-Plex-Product": "POPS",
        "X-Plex-Client-Identifier": clientId,
      },
    });
    if (!res.ok) {
      const status = res.status;
      throw new TRPCError({
        code: status === 429 ? "TOO_MANY_REQUESTS" : "INTERNAL_SERVER_ERROR",
        message: `Failed to get Plex PIN (HTTP ${status})`,
      });
    }
    const data = (await res.json()) as { id: number; code: string };
    return { data: { id: data.id, code: data.code, clientId } };
  }),

  checkAuthPin: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const clientId = plexService.getPlexClientId();
      const res = await fetch(`https://plex.tv/api/v2/pins/${input.id}`, {
        headers: {
          Accept: "application/json",
          "X-Plex-Client-Identifier": clientId,
        },
      });

      if (!res.ok) {
        const status = res.status;
        if (status === 404) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Invalid or expired PIN ID",
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to check Plex PIN (HTTP ${status})`,
        });
      }

      const data = (await res.json()) as {
        authToken?: string | null;
        expiresAt?: string | null;
        username?: string | null;
      };

      if (data.expiresAt) {
        const expiresAt = new Date(data.expiresAt);
        if (expiresAt.getTime() < Date.now()) {
          return { data: { connected: false, expired: true } };
        }
      }

      console.log(
        `[Plex] PIN check response for ${input.id}:`,
        data.authToken ? "Token received" : "No token yet"
      );

      if (data.authToken) {
        const db = getDrizzle();
        console.log(`[Plex] Encrypting and saving token to database...`);
        const encryptedToken = plexService.encryptToken(data.authToken);
        db.insert(settings)
          .values({ key: "plex_token", value: encryptedToken })
          .onConflictDoUpdate({ target: settings.key, set: { value: encryptedToken } })
          .run();

        if (data.username) {
          db.insert(settings)
            .values({ key: "plex_username", value: data.username })
            .onConflictDoUpdate({ target: settings.key, set: { value: data.username } })
            .run();
        }

        return { data: { connected: true, username: data.username ?? null } };
      }
      return { data: { connected: false, expired: false } };
    }),

  getPlexUsername: protectedProcedure.query(() => {
    return { data: plexService.getPlexUsername() };
  }),

  disconnect: protectedProcedure.mutation(() => {
    const db = getDrizzle();
    db.delete(settings)
      .where(inArray(settings.key, ["plex_token", "plex_username"]))
      .run();
    return { message: "Disconnected from Plex" };
  }),
});
