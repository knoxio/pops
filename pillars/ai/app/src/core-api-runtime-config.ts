/**
 * Runtime config for the generated core Hey API client.
 *
 * The cache-maintenance endpoints (`/ai-usage/cache*`) are served by the
 * CORE pillar, not the ai pillar, so the AI-Ops FE reaches them through
 * the shell's `/core-api` proxy path (vite dev + the production reverse
 * proxy both map it onto the deployed core pillar), matching the shell's
 * own core client base URL.
 */
import type { CreateClientConfig } from './core-api/client.gen.js';

export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  baseUrl: '/core-api',
});
