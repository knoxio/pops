/**
 * Paperless-ngx API client — re-exports and factory.
 */
import { getEnv } from '../../../env.js';
import { PaperlessClient } from './client.js';

export { PaperlessClient } from './client.js';
export {
  PaperlessApiError,
  type PaperlessCorrespondent,
  type PaperlessDocument,
  type PaperlessDocumentType,
  type PaperlessSearchResult,
  type PaperlessTag,
} from './types.js';

/**
 * Shared Paperless client factory.
 * Returns null if PAPERLESS_BASE_URL or PAPERLESS_API_TOKEN are not set.
 */
export function getPaperlessClient(): PaperlessClient | null {
  const url = getEnv('PAPERLESS_BASE_URL');
  const token = getEnv('PAPERLESS_API_TOKEN');
  if (!url || !token) return null;
  return new PaperlessClient(url, token);
}
