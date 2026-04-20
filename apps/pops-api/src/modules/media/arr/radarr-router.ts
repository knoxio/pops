import { z } from 'zod';

import { protectedProcedure } from '../../../trpc.js';
import { downloadAndProtectMovie } from './download-and-protect.js';
import { radarrProceduresCore } from './radarr-procedures.js';
import { radarrSettingsProcedures } from './radarr-settings-procedures.js';
import { resolveArrApiKey } from './router-helpers.js';

/**
 * @deprecated re-exported for backwards compatibility — prefer {@link resolveArrApiKey}.
 */
export const resolveApiKey = resolveArrApiKey;

const DownloadAndProtectInput = z.object({
  tmdbId: z.number().int().positive(),
  title: z.string().min(1),
  year: z.number().int().positive(),
});

export const radarrProcedures = {
  ...radarrSettingsProcedures,
  ...radarrProceduresCore,

  /**
   * Add a movie to Radarr, create a POPS library entry, and set rotation_status = 'protected'.
   */
  downloadAndProtect: protectedProcedure
    .input(DownloadAndProtectInput)
    .mutation(async ({ input }) => {
      return { data: await downloadAndProtectMovie(input) };
    }),
};
