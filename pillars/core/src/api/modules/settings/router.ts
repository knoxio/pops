/**
 * `core.settings.*` tRPC router (Theme 13 PRD-247 US-01 / US-03).
 *
 * Wire surface for the cross-pillar settings SDK on `pops-core-api`:
 *
 *   - `core.settings.get`      query     single read (returns `null` on miss)
 *   - `core.settings.set`      mutation  typed upsert
 *   - `core.settings.ensure`   mutation  write-once upsert-and-return
 *   - `core.settings.delete`   mutation  single delete (404 on miss)
 *   - `core.settings.getMany`  query     batch read (missing keys omitted)
 *   - `core.settings.setMany`  mutation  transactional batch write
 *
 * `getMany` is the Plex hot-path shape — `loadSavedSelections`,
 * `connectionStatus`, and `getPlexClient` each batch-read 3–4 settings
 * per call. A naive N round-trip port would regress p99 sync latency,
 * so the bulk read is mounted from the surface's first commit.
 *
 * Implementation reuses `@pops/core-db`'s `settingsService` against the
 * `ctx.coreDb` handle injected at context-creation time. There is no
 * table-shape duplication — the in-monolith
 * `apps/pops-api/src/modules/core/settings/router.ts` keeps its `list`
 * procedure for the in-pillar settings UI, but every other procedure
 * shares this service layer.
 *
 * Schemas are imported from `@pops/core-contract`'s
 * `settings-procedures` module so the wire shape is the single source
 * of truth for both the typed `pillar<CoreRouter>('core').settings.*`
 * proxy and the server's own validation.
 */
import {
  SettingsDeleteInputSchema,
  SettingsDeleteOutputSchema,
  SettingsEnsureInputSchema,
  SettingsEnsureOutputSchema,
  SettingsGetInputSchema,
  SettingsGetManyInputSchema,
  SettingsGetManyOutputSchema,
  SettingsGetOutputSchema,
  SettingsSetInputSchema,
  SettingsSetManyInputSchema,
  SettingsSetManyOutputSchema,
  SettingsSetOutputSchema,
} from '../../../contract/index.js';
import { SettingNotFoundError, settingsService } from '../../../db/index.js';
import { NotFoundError } from '../../shared/errors.js';
import { mapDomainErrors } from '../../shared/trpc-error-mapper.js';
import { protectedProcedure, router } from '../../trpc.js';

function toWireSetting(row: { key: string; value: string }): { key: string; value: string } {
  return { key: row.key, value: row.value };
}

export const settingsRouter = router({
  get: protectedProcedure
    .input(SettingsGetInputSchema)
    .output(SettingsGetOutputSchema)
    .query(({ input, ctx }) => {
      const row = settingsService.getSettingOrNull(ctx.coreDb, input.key);
      return { data: row ? toWireSetting(row) : null };
    }),

  set: protectedProcedure
    .input(SettingsSetInputSchema)
    .output(SettingsSetOutputSchema)
    .mutation(({ input, ctx }) => {
      const row = settingsService.setRawSetting(ctx.coreDb, input.key, input.value);
      return { data: toWireSetting(row), message: 'Setting saved' };
    }),

  ensure: protectedProcedure
    .input(SettingsEnsureInputSchema)
    .output(SettingsEnsureOutputSchema)
    .mutation(({ input, ctx }) => {
      const row = settingsService.ensureSetting(ctx.coreDb, input.key, input.value);
      return { data: toWireSetting(row) };
    }),

  delete: protectedProcedure
    .input(SettingsDeleteInputSchema)
    .output(SettingsDeleteOutputSchema)
    .mutation(({ input, ctx }) =>
      mapDomainErrors(() => {
        try {
          settingsService.deleteSetting(ctx.coreDb, input.key);
        } catch (err) {
          if (err instanceof SettingNotFoundError) {
            throw new NotFoundError('Setting', err.key);
          }
          throw err;
        }
        return { message: 'Setting deleted' };
      })
    ),

  getMany: protectedProcedure
    .input(SettingsGetManyInputSchema)
    .output(SettingsGetManyOutputSchema)
    .query(({ input, ctx }) => {
      return { settings: settingsService.getBulkSettings(ctx.coreDb, input.keys) };
    }),

  setMany: protectedProcedure
    .input(SettingsSetManyInputSchema)
    .output(SettingsSetManyOutputSchema)
    .mutation(({ input, ctx }) => {
      return { settings: settingsService.setBulkSettings(ctx.coreDb, input.entries) };
    }),
});
