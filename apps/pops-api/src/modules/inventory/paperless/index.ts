/**
 * Paperless-ngx API client — re-exports and factory.
 */
import { PaperlessClient } from "./client.js";
import { getEnv } from "../../../env.js";

export { PaperlessClient } from "./client.js";
export {
  PaperlessApiError,
  type PaperlessDocument,
  type PaperlessCorrespondent,
  type PaperlessTag,
  type PaperlessDocumentType,
  type PaperlessSearchResult,
} from "./types.js";

/**
 * Shared Paperless client factory.
 * Returns null if PAPERLESS_URL or PAPERLESS_TOKEN are not set.
 */
export function getPaperlessClient(): PaperlessClient | null {
  const url = getEnv("PAPERLESS_URL");
  const token = getEnv("PAPERLESS_TOKEN");
  if (!url || !token) return null;
  return new PaperlessClient(url, token);
}
