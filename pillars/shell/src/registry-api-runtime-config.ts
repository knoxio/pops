/**
 * Runtime config for the generated registry Hey API client.
 *
 * The default base URL points at the shell's `/registry-api` proxy path,
 * which vite (dev) and the production reverse proxy both map onto the
 * deployed registry pillar (see `vite.config.ts` proxy + `gen:nginx`).
 */
import type { CreateClientConfig } from './registry-api/client.gen.js';

export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  baseUrl: '/registry-api',
});
