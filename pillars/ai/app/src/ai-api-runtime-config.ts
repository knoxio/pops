/**
 * Runtime config for the generated ai Hey API client.
 *
 * The default base URL points at the shell's `/ai-api` proxy path,
 * which vite (dev) and the production reverse proxy both map onto the
 * deployed ai pillar. Callers can override `baseUrl` via the React
 * provider when running against another host (e2e, storybook).
 */
import type { CreateClientConfig } from './ai-api/client.gen.js';

export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  baseUrl: '/ai-api',
});
