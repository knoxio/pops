/**
 * Runtime config for the generated media Hey API client.
 *
 * The default base URL points at the shell's `/media-api` proxy path,
 * which vite (dev) and the production reverse proxy both map onto the
 * deployed media pillar. Callers can override `baseUrl` via the React
 * provider when running against another host (e2e, storybook).
 */
import type { CreateClientConfig } from './media-api/client.gen.js';

export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  baseUrl: '/media-api',
});
