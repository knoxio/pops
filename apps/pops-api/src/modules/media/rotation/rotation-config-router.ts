import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { settings } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { protectedProcedure } from '../../../trpc.js';

/** All rotation setting keys and their defaults. */
export const ROTATION_SETTING_KEYS = {
  enabled: { key: 'rotation_enabled', default: '' },
  cronExpression: { key: 'rotation_cron_expression', default: '0 3 * * *' },
  targetFreeGb: { key: 'rotation_target_free_gb', default: '100' },
  leavingDays: { key: 'rotation_leaving_days', default: '7' },
  dailyAdditions: { key: 'rotation_daily_additions', default: '2' },
  avgMovieGb: { key: 'rotation_avg_movie_gb', default: '15' },
  protectedDays: { key: 'rotation_protected_days', default: '30' },
} as const satisfies Record<string, { key: string; default: string }>;

export const rotationConfigProcedures = {
  /** Get all rotation settings with defaults. */
  getSettings: protectedProcedure.query(() => {
    const db = getDrizzle();
    const result: Record<string, string> = {};
    for (const [name, def] of Object.entries(ROTATION_SETTING_KEYS)) {
      const record = db.select().from(settings).where(eq(settings.key, def.key)).get();
      result[name] = record?.value ?? def.default;
    }
    return result;
  }),

  /** Save rotation settings. */
  saveSettings: protectedProcedure
    .input(
      z.object({
        cronExpression: z.string().min(1).optional(),
        targetFreeGb: z.number().min(0).optional(),
        leavingDays: z.number().int().min(1).optional(),
        dailyAdditions: z.number().int().min(1).optional(),
        avgMovieGb: z.number().gt(0).optional(),
        protectedDays: z.number().int().min(0).optional(),
      })
    )
    .mutation(({ input }) => {
      const db = getDrizzle();
      const entries: [string, string][] = [];
      if (input.cronExpression !== undefined)
        entries.push([ROTATION_SETTING_KEYS.cronExpression.key, input.cronExpression]);
      if (input.targetFreeGb !== undefined)
        entries.push([ROTATION_SETTING_KEYS.targetFreeGb.key, String(input.targetFreeGb)]);
      if (input.leavingDays !== undefined)
        entries.push([ROTATION_SETTING_KEYS.leavingDays.key, String(input.leavingDays)]);
      if (input.dailyAdditions !== undefined)
        entries.push([ROTATION_SETTING_KEYS.dailyAdditions.key, String(input.dailyAdditions)]);
      if (input.avgMovieGb !== undefined)
        entries.push([ROTATION_SETTING_KEYS.avgMovieGb.key, String(input.avgMovieGb)]);
      if (input.protectedDays !== undefined)
        entries.push([ROTATION_SETTING_KEYS.protectedDays.key, String(input.protectedDays)]);

      for (const [key, value] of entries) {
        db.insert(settings)
          .values({ key, value })
          .onConflictDoUpdate({ target: settings.key, set: { value } })
          .run();
      }

      return { success: true, updated: entries.length };
    }),
};
