/**
 * Runtime config for app-finance's generated contacts Hey API client.
 *
 * The default base URL points at the shell's `/contacts-api` proxy path,
 * which vite (dev) and the production reverse proxy both map onto the
 * deployed contacts pillar. The entities admin page and the entity pickers
 * read contacts cross-pillar through this client.
 */
import type { CreateClientConfig } from './contacts-api/client.gen.js';

export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  baseUrl: '/contacts-api',
});
