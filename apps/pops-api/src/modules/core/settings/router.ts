/**
 * Settings tRPC router — CRUD for key-value settings
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { NotFoundError } from '../../../shared/errors.js';
import { paginationMeta, PaginationMetaSchema } from '../../../shared/pagination.js';
import { protectedProcedure, router } from '../../../trpc.js';
import { SETTINGS_KEY_VALUES } from './keys.js';
import * as service from './service.js';
import { SettingListSchema, SettingSchema, toSetting } from './types.js';

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

export const settingsRouter = router({
  /** List all settings with optional search filter */
  list: protectedProcedure
    .meta({
      openapi: { method: 'GET', path: '/settings', summary: 'List settings', tags: ['settings'] },
    })
    .input(SettingListSchema)
    .output(z.object({ data: z.array(SettingSchema), pagination: PaginationMetaSchema }))
    .query(({ input }) => {
      const limit = input.limit ?? DEFAULT_LIMIT;
      const offset = input.offset ?? DEFAULT_OFFSET;

      const { rows, total } = service.listSettings(input.search, limit, offset);

      return {
        data: rows.map(toSetting),
        pagination: paginationMeta(total, limit, offset),
      };
    }),

  /** Get a single setting by key (returns null when key does not exist) */
  get: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/settings/{key}',
        summary: 'Get setting by key',
        tags: ['settings'],
      },
    })
    .input(z.object({ key: z.enum(SETTINGS_KEY_VALUES) }))
    .output(z.object({ data: SettingSchema.nullable() }))
    .query(({ input }) => {
      const row = service.getSettingOrNull(input.key);
      return { data: row ? toSetting(row) : null };
    }),

  /** Set a setting value (upsert — creates or updates) */
  set: protectedProcedure
    .meta({
      openapi: {
        method: 'PUT',
        path: '/settings/{key}',
        summary: 'Set setting value',
        tags: ['settings'],
      },
    })
    .input(z.object({ key: z.enum(SETTINGS_KEY_VALUES), value: z.string() }))
    .output(z.object({ data: SettingSchema, message: z.string() }))
    .mutation(({ input }) => {
      const row = service.setSetting(input);
      return {
        data: toSetting(row),
        message: 'Setting saved',
      };
    }),

  /** Delete a setting by key */
  delete: protectedProcedure
    .input(z.object({ key: z.enum(SETTINGS_KEY_VALUES) }))
    .mutation(({ input }) => {
      try {
        service.deleteSetting(input.key);
        return { message: 'Setting deleted' };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
        }
        throw err;
      }
    }),
});
