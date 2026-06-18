import { index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

/**
 * Per-user preferences. Used by the feature toggle framework when a feature
 * declares `scope: 'user'` so the user override resolves before the
 * system-level default.
 *
 * Keyed by the authenticated email (single-user system today, but the schema
 * supports multi-user without further migrations).
 */
export const userSettings = sqliteTable(
  'user_settings',
  {
    userEmail: text('user_email').notNull(),
    key: text('key').notNull(),
    value: text('value').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userEmail, table.key] }),
    userIdx: index('idx_user_settings_user').on(table.userEmail),
  })
);

export type UserSettingRow = InferSelectModel<typeof userSettings>;
export type UserSettingInsert = InferInsertModel<typeof userSettings>;
