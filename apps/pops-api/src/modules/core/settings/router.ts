/**
 * Settings tRPC router — CRUD for key-value settings
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../../trpc.js";
import { paginationMeta } from "../../../shared/pagination.js";
import { SetSettingSchema, SettingListSchema, toSetting } from "./types.js";
import * as service from "./service.js";
import { NotFoundError } from "../../../shared/errors.js";

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

export const settingsRouter = router({
  /** List all settings with optional search filter */
  list: protectedProcedure.input(SettingListSchema).query(({ input }) => {
    const limit = input.limit ?? DEFAULT_LIMIT;
    const offset = input.offset ?? DEFAULT_OFFSET;

    const { rows, total } = service.listSettings(input.search, limit, offset);

    return {
      data: rows.map(toSetting),
      pagination: paginationMeta(total, limit, offset),
    };
  }),

  /** Get a single setting by key */
  get: protectedProcedure.input(z.object({ key: z.string() })).query(({ input }) => {
    try {
      const row = service.getSetting(input.key);
      return { data: toSetting(row) };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: "NOT_FOUND", message: err.message });
      }
      throw err;
    }
  }),

  /** Set a setting value (upsert — creates or updates) */
  set: protectedProcedure.input(SetSettingSchema).mutation(({ input }) => {
    const row = service.setSetting(input);
    return {
      data: toSetting(row),
      message: "Setting saved",
    };
  }),

  /** Delete a setting by key */
  delete: protectedProcedure.input(z.object({ key: z.string() })).mutation(({ input }) => {
    try {
      service.deleteSetting(input.key);
      return { message: "Setting deleted" };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: "NOT_FOUND", message: err.message });
      }
      throw err;
    }
  }),
});
