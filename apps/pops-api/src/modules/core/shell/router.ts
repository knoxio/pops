/**
 * Shell manifest router (PRD-100, US-03).
 *
 * Single read-path the frontend calls at boot to learn which apps and
 * overlays are installed in this deployment. Drives shell route filtering
 * and overlay mounting; values mirror `POPS_APPS` / `POPS_OVERLAYS`.
 */
import { z } from 'zod';

import { protectedProcedure, router } from '../../../trpc.js';
import { readInstalledModules } from '../../env-modules.js';

const ManifestSchema = z.object({
  apps: z.array(z.string()).readonly(),
  overlays: z.array(z.string()).readonly(),
});

export const shellRouter = router({
  manifest: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/shell/manifest',
        summary: 'List installed modules (apps + overlays)',
        tags: ['shell'],
      },
    })
    .input(z.void())
    .output(ManifestSchema)
    .query(() => {
      const installed = readInstalledModules();
      return {
        apps: [...installed.apps],
        overlays: [...installed.overlays],
      };
    }),
});
