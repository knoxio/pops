/**
 * The ai pillar's `settings.*` sub-router — RU + reset over its own `ai.*`
 * keys, served from the `settings` table in `ai.db` via `@pops/pillar-settings`
 * (settings-federation S1, per-pillar ownership).
 *
 * Built from the shared `makeSettingsContract` constrained to
 * {@link AI_SETTINGS_KEYS}, so the `:key` path param only accepts the keys the
 * ai pillar owns.
 */
import { makeSettingsContract } from '@pops/pillar-settings';

import { AUTH_ERR_RESPONSES } from './rest-schemas.js';
import { AI_SETTINGS_KEYS } from './settings/key-defaults.js';

export const aiSettingsContract = makeSettingsContract(AI_SETTINGS_KEYS, AUTH_ERR_RESPONSES);
