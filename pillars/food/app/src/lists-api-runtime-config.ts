/**
 * Runtime config for app-food's generated lists Hey API client.
 *
 * The default base URL points at the shell's `/lists-api` proxy path,
 * which vite (dev) and the production reverse proxy both map onto the
 * deployed lists pillar. The send-to-list modal reads shopping lists
 * cross-pillar through this client.
 */
import type { CreateClientConfig } from './lists-api/client.gen.js';

export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  baseUrl: '/lists-api',
});
