import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Load .env from repo root (2 levels up from src/)
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../..", ".env") });

import { createApp } from "./app.js";
import { closeDb } from "./db.js";
import { startTtlWatcher } from "./modules/core/envs/ttl-watcher.js";
import { startupCleanup } from "./modules/core/envs/registry.js";

const port = Number(process.env["PORT"] ?? 3000);
const app = createApp();

// Clean up expired and orphaned env DBs left over from any previous crash
const { expired, orphaned } = startupCleanup();
if (expired.length > 0)
  console.log(`[pops-api] Cleaned up ${expired.length} expired env(s): ${expired.join(", ")}`);
if (orphaned.length > 0)
  console.log(`[pops-api] Removed ${orphaned.length} orphaned env DB(s): ${orphaned.join(", ")}`);

const server = app.listen(port, () => {
  console.log(`[pops-api] Listening on port ${port}`);
});

// Periodically purge expired named environments
const ttlWatcher = startTtlWatcher();

function shutdown(): void {
  console.log("[pops-api] Shutting down...");
  clearInterval(ttlWatcher);
  server.close(() => {
    closeDb();
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
