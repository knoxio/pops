/**
 * Runtime config for app-finance's generated core Hey API client.
 *
 * The default base URL points at the shell's `/core-api` proxy path,
 * which vite (dev) and the production reverse proxy both map onto the
 * deployed core pillar. The entities admin page and the entity pickers
 * read core cross-pillar through this client.
 */
import type { CreateClientConfig } from './core-api/client.gen.js';

export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  baseUrl: '/core-api',
});
