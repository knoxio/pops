/**
 * `shell.*` sub-router — boot-time install manifest.
 *
 * A single read the frontend calls at boot to learn which apps and overlays are
 * installed in this deployment. No input, so it is a `GET`. The response shape
 * `{ apps, overlays }` is string arrays mirroring `POPS_APPS` / `POPS_OVERLAYS`.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

/** Wire shape served by the shell manifest read. */
export const ManifestSchema = z.object({
  apps: z.array(z.string()),
  overlays: z.array(z.string()),
});

export const coreShellContract = c.router({
  manifest: {
    method: 'GET',
    path: '/shell/manifest',
    responses: { 200: ManifestSchema },
    summary: 'Read the boot-time install manifest (installed apps + overlays)',
  },
});
