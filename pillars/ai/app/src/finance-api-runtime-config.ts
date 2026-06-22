/**
 * Runtime config for the generated finance Hey API client.
 *
 * The cache-maintenance endpoints (`/ai-usage/cache*`) are served by the
 * FINANCE pillar (re-homed from core, gap #3489), not the ai pillar, so the
 * AI-Ops FE reaches them through the shell's `/finance-api` proxy path (vite
 * dev + the production reverse proxy both map it onto the deployed finance
 * pillar), matching the shell's own finance client base URL.
 */
import type { CreateClientConfig } from './finance-api/client.gen.js';

export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  baseUrl: '/finance-api',
});
