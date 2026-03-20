/**
 * Drizzle Kit configuration for POPS API.
 *
 * Migration workflow:
 *   1. Edit schema files in packages/db-types/src/schema/
 *   2. Run `mise drizzle:generate` (or `pnpm exec drizzle-kit generate`)
 *   3. Review the generated SQL in src/db/drizzle-migrations/
 *   4. Run `mise drizzle:migrate` to apply (or `pnpm exec drizzle-kit migrate`)
 *
 * Note: The baseline migration (0000_*) captures the full schema as of E06.
 * Existing production databases already have this schema applied via the
 * incremental SQL migrations in src/db/migrations/. Do NOT re-apply the
 * baseline to an existing prod DB — it will conflict. Drizzle migrations
 * are for new schema changes going forward.
 */
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "../../packages/db-types/src/schema/*",
  out: "./src/db/drizzle-migrations",
  dbCredentials: {
    url: process.env["SQLITE_PATH"] ?? "./data/pops.db",
  },
});
