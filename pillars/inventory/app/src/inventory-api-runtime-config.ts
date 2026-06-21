/**
 * Runtime config for the generated `@pops/inventory` Hey API client.
 *
 * The default base URL points at the shell's `/inventory-api` proxy
 * path, which vite (dev) and the production reverse proxy both map onto
 * the deployed inventory pillar. Callers can override `baseUrl` via the
 * React provider when running against another host (e2e, storybook).
 */
import type { CreateClientConfig } from './inventory-api/client.gen.js';

export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  baseUrl: '/inventory-api',
});
