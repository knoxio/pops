/**
 * Paperless-ngx API client — re-exports and factory.
 */
import { getEnv } from '../../../env.js';
import { isEnabled } from '../../core/features/index.js';
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
 * Returns `null` when the `inventory.paperless` feature is disabled — gating
 * goes through the feature toggle framework (PRD-094) so credentials, env-var
 * presence, and admin overrides resolve consistently with every other module.
 */
export function getPaperlessClient(): PaperlessClient | null {
  if (!isEnabled('inventory.paperless')) return null;
  const url = getEnv('PAPERLESS_BASE_URL');
  const token = getEnv('PAPERLESS_API_TOKEN');
  if (!url || !token) return null;
  return new PaperlessClient(url, token);
}
