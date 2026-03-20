import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema/*",
  out: "./src/db/drizzle-migrations",
  dbCredentials: {
    url: process.env["SQLITE_PATH"] ?? "./data/pops.db",
  },
});
