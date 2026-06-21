/**
 * Runtime config for the generated `@pops/lists` Hey API client.
 *
 * The default base URL points at the shell's `/lists-api` proxy path,
 * which vite (dev) and the production reverse proxy both map onto the
 * deployed lists pillar. Callers wrap the client with a different
 * `baseUrl` via the React provider when running against another host
 * (e.g. e2e harness, storybook).
 */
import type { CreateClientConfig } from './lists-api/client.gen.js';

export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  baseUrl: '/lists-api',
});
