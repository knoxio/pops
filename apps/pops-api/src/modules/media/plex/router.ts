/**
 * Plex tRPC router — sync operations and connection management.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { settings } from "@pops/db-types";
import { router, protectedProcedure } from "../../../trpc.js";
import { PlexApiError } from "./types.js";
import { PlexClient } from "./client.js";
import * as plexService from "./service.js";
import * as scheduler from "./scheduler.js";
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
  /** Test connection to Plex Media Server. */
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

  /** List Plex library sections. */
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

  /** Sync movies from a Plex library section. */
  syncMovies: protectedProcedure
    .input(z.object({ sectionId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const client = requirePlexClient();
      try {
        const result = await plexService.syncMovies(client, input.sectionId);
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

  /** Sync TV shows from a Plex library section. */
  syncTvShows: protectedProcedure
    .input(z.object({ sectionId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const client = requirePlexClient();
      try {
        const result = await plexService.syncTvShows(client, input.sectionId);
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

  /** Get current sync status. */
  getSyncStatus: protectedProcedure.query(() => {
    const client = plexService.getPlexClient();
    return { data: plexService.getSyncStatus(client) };
  }),

  /** Set Plex Server URL and validate connection */
  setUrl: protectedProcedure
    .input(z.object({ url: z.string().min(1) }))
    .mutation(async ({ input }) => {
      let finalUrl = input.url.trim();
      if (!finalUrl.startsWith("http://") && !finalUrl.startsWith("https://")) {
        finalUrl = `http://${finalUrl}`;
      }

      // 1. Basic URL format validation
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

      // 2. Connectivity test
      try {
        if (token) {
          // Full validation with token
          console.log(`[Plex] Validating full connection to ${finalUrl}...`);
          const testClient = new PlexClient(finalUrl, token);
          await testClient.getLibraries();
        } else {
          // Basic reachability test (no token yet)
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

      // 3. Save if validated
      console.log(`[Plex] Updating server URL to: ${finalUrl}`);
      db.insert(settings)
        .values({ key: "plex_url", value: finalUrl })
        .onConflictDoUpdate({ target: settings.key, set: { value: finalUrl } })
        .run();

      return { message: "Plex URL updated and validated" };
    }),

  /** Get current Plex URL (from settings or env) */
  getPlexUrl: protectedProcedure.query(() => {
    return { data: plexService.getPlexUrl() };
  }),

  /** Start the periodic sync scheduler. */
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

  /** Stop the periodic sync scheduler. */
  stopScheduler: protectedProcedure.mutation(() => {
    const status = scheduler.stopScheduler();
    return { data: status };
  }),

  /** Get scheduler status. */
  getSchedulerStatus: protectedProcedure.query(() => {
    return { data: scheduler.getSchedulerStatus() };
  }),

  /** Get Plex Auth PIN */
  getAuthPin: protectedProcedure.mutation(async () => {
    const clientId = plexService.getPlexClientId();
    const res = await fetch("https://plex.tv/api/v2/pins?strong=true", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "X-Plex-Product": "POPS",
        "X-Plex-Client-Identifier": clientId,
      },
    });
    if (!res.ok) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to get Plex PIN" });
    }
    const data = (await res.json()) as { id: number; code: string };
    return { data: { id: data.id, code: data.code, clientId } };
  }),

  /** Check Plex Auth PIN status */
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
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to check Plex PIN" });
      }
      const data = (await res.json()) as { authToken?: string | null };
      console.log(
        `[Plex] PIN check response for ${input.id}:`,
        data.authToken ? "Token received" : "No token yet"
      );

      if (data.authToken) {
        const db = getDrizzle();
        console.log(`[Plex] Saving token to database...`);
        db.insert(settings)
          .values({ key: "plex_token", value: data.authToken })
          .onConflictDoUpdate({ target: settings.key, set: { value: data.authToken } })
          .run();
        return { data: { connected: true } };
      }
      return { data: { connected: false } };
    }),

  /** Disconnect Plex */
  disconnect: protectedProcedure.mutation(() => {
    const db = getDrizzle();
    db.delete(settings).where(eq(settings.key, "plex_token")).run();
    return { message: "Disconnected from Plex" };
  }),
});
