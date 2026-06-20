/**
 * Paperless-ngx API client — re-exports and factory.
 *
 * Gating policy in the pillar container: presence of both
 * `PAPERLESS_BASE_URL` and `PAPERLESS_API_TOKEN` env vars enables the
 * integration. The pops-api feature-toggle framework (PRD-094) lives in
 * the lake; once the pillar grows its own feature gating the check moves
 * back here.
 */
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
 *
 * Returns `null` when the required env vars are absent; callers should
 * surface a PRECONDITION_FAILED to the client in that case.
 */
export function getPaperlessClient(): PaperlessClient | null {
  const url = process.env['PAPERLESS_BASE_URL'];
  const token = process.env['PAPERLESS_API_TOKEN'];
  if (!url || !token) return null;
  return new PaperlessClient(url, token);
}
