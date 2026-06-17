/**
 * Runtime config for the generated ego Hey API client.
 *
 * The ego surface is served by the cerebrum pillar under the shell's
 * `/cerebrum-api` proxy path, which vite (dev) and the production reverse
 * proxy both map onto the deployed cerebrum pillar.
 */
import type { CreateClientConfig } from './ego-api/client.gen.js';

export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  baseUrl: '/cerebrum-api',
});
