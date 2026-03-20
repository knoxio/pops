/**
 * Environment variable loader
 * Supports both local development (.env) and production (Docker secrets)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SECRETS_DIR = "/run/secrets";

/**
 * Get environment variable from either:
 * 1. Docker secret file (/run/secrets/secret_name)
 * 2. Environment variable (process.env.SECRET_NAME)
 *
 * In production, Docker mounts secrets as files.
 * In development, dotenv loads from .env into process.env.
 */
export function getEnv(name: string): string | undefined {
  // Try Docker secret file first (production)
  const secretPath = join(SECRETS_DIR, name.toLowerCase());
  try {
    const value = readFileSync(secretPath, "utf-8").trim();
    if (value) return value;
  } catch {
    // Secret file doesn't exist, fall through to env var
  }

  // Fall back to environment variable (development)
  return process.env[name];
}

/**
 * Get required environment variable
 * Throws if not found
 */
export function requireEnv(name: string): string {
  const value = getEnv(name);
  if (!value) {
    throw new Error(`${name} environment variable not set`);
  }
  return value;
}
