/**
 * Runtime config for the generated finance Hey API client.
 *
 * The default base URL points at the shell's `/finance-api` proxy
 * path, which vite (dev) and the production reverse proxy both map onto
 * the deployed finance pillar. Callers can override `baseUrl` via the
 * React provider when running against another host (e2e, storybook).
 */
import type { CreateClientConfig } from './finance-api/client.gen.js';

export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  baseUrl: '/finance-api',
});
