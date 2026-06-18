/**
 * `core.shell.manifest` router (PRD-100, US-03).
 *
 * Single read-path the frontend calls at boot to learn which apps and
 * overlays are installed in this deployment. Drives shell route filtering
 * and overlay mounting; values mirror `POPS_APPS` / `POPS_OVERLAYS`.
 *
 * Relocated from `apps/pops-api/src/modules/core/shell/router.ts`. The
 * OpenAPI `.meta()` is dropped (the pillar surface is tRPC-only) and the
 * install set is read from the pillar-local `env-modules` copy.
 */
import { z } from 'zod';

import { readInstalledModules } from '../../env-modules.js';
import { protectedProcedure, router } from '../../trpc.js';

const ManifestSchema = z.object({
  apps: z.array(z.string()).readonly(),
  overlays: z.array(z.string()).readonly(),
});

export const shellRouter = router({
  manifest: protectedProcedure
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
