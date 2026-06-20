/**
 * Runtime config for the generated core Hey API client.
 *
 * The default base URL points at the shell's `/core-api` proxy path,
 * which vite (dev) and the production reverse proxy both map onto the
 * deployed core pillar (see `vite.config.ts` proxy + `gen:nginx`).
 */
import type { CreateClientConfig } from './core-api/client.gen.js';

export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  baseUrl: '/core-api',
});
