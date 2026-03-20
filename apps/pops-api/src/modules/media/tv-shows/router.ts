/**
 * TV Shows tRPC router — CRUD procedures for shows, seasons, and episodes.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../../trpc.js";
import { paginationMeta } from "../../../shared/pagination.js";
import {
  CreateTvShowSchema,
  UpdateTvShowSchema,
  TvShowQuerySchema,
  CreateSeasonSchema,
  CreateEpisodeSchema,
  toTvShow,
  toSeason,
  toEpisode,
} from "./types.js";
import * as service from "./service.js";
import { NotFoundError, ConflictError } from "../../../shared/errors.js";

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

export const tvShowsRouter = router({
  // ── Shows ──

  list: protectedProcedure.input(TvShowQuerySchema).query(({ input }) => {
    const limit = input.limit ?? DEFAULT_LIMIT;
    const offset = input.offset ?? DEFAULT_OFFSET;

    const { rows, total } = service.listTvShows(input.search, input.status, limit, offset);

    return {
      data: rows.map(toTvShow),
      pagination: paginationMeta(total, limit, offset),
    };
  }),

  get: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(({ input }) => {
      try {
        const row = service.getTvShow(input.id);
        return { data: toTvShow(row) };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message });
        }
        throw err;
      }
    }),

  create: protectedProcedure.input(CreateTvShowSchema).mutation(({ input }) => {
    try {
      const row = service.createTvShow(input);
      return { data: toTvShow(row), message: "TV show created" };
    } catch (err) {
      if (err instanceof ConflictError) {
        throw new TRPCError({ code: "CONFLICT", message: err.message });
      }
      throw err;
    }
  }),

  update: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), data: UpdateTvShowSchema }))
    .mutation(({ input }) => {
      try {
        const row = service.updateTvShow(input.id, input.data);
        return { data: toTvShow(row), message: "TV show updated" };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message });
        }
        throw err;
      }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input }) => {
      try {
        service.deleteTvShow(input.id);
        return { message: "TV show deleted" };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message });
        }
        throw err;
      }
    }),

  // ── Seasons ──

  listSeasons: protectedProcedure
    .input(z.object({ tvShowId: z.number().int().positive() }))
    .query(({ input }) => {
      try {
        const { rows, total } = service.listSeasons(input.tvShowId);
        return { data: rows.map(toSeason), total };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message });
        }
        throw err;
      }
    }),

  createSeason: protectedProcedure.input(CreateSeasonSchema).mutation(({ input }) => {
    try {
      const row = service.createSeason(input);
      return { data: toSeason(row), message: "Season created" };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: "NOT_FOUND", message: err.message });
      }
      if (err instanceof ConflictError) {
        throw new TRPCError({ code: "CONFLICT", message: err.message });
      }
      throw err;
    }
  }),

  deleteSeason: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input }) => {
      try {
        service.deleteSeason(input.id);
        return { message: "Season deleted" };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message });
        }
        throw err;
      }
    }),

  // ── Episodes ──

  listEpisodes: protectedProcedure
    .input(z.object({ seasonId: z.number().int().positive() }))
    .query(({ input }) => {
      try {
        const { rows, total } = service.listEpisodes(input.seasonId);
        return { data: rows.map(toEpisode), total };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message });
        }
        throw err;
      }
    }),

  createEpisode: protectedProcedure.input(CreateEpisodeSchema).mutation(({ input }) => {
    try {
      const row = service.createEpisode(input);
      return { data: toEpisode(row), message: "Episode created" };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: "NOT_FOUND", message: err.message });
      }
      if (err instanceof ConflictError) {
        throw new TRPCError({ code: "CONFLICT", message: err.message });
      }
      throw err;
    }
  }),

  deleteEpisode: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input }) => {
      try {
        service.deleteEpisode(input.id);
        return { message: "Episode deleted" };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message });
        }
        throw err;
      }
    }),
});
