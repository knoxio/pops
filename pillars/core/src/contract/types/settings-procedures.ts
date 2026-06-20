/**
 * TypeScript types for the `core.settings.*` cross-pillar SDK procedures.
 *
 * PRD-247 US-01 — foundational schema + types. Types are inferred from
 * the Zod schemas in `../schemas/settings-procedures.ts` so the wire shape
 * stays single-sourced. Round-trip tests under `__tests__/` enforce that
 * `z.infer<typeof XSchema>` agrees with these exported aliases.
 *
 * Consumers import these directly to type their handlers and callers:
 *
 * ```ts
 * import type {
 *   SettingsGetInput,
 *   SettingsGetOutput,
 *   SettingsGetManyOutput,
 * } from '@pops/core-contract/types';
 * ```
 */
import type { z } from 'zod';

import type {
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
} from '../schemas/settings-procedures.js';

export type SettingsGetInput = z.infer<typeof SettingsGetInputSchema>;
export type SettingsGetOutput = z.infer<typeof SettingsGetOutputSchema>;

export type SettingsSetInput = z.infer<typeof SettingsSetInputSchema>;
export type SettingsSetOutput = z.infer<typeof SettingsSetOutputSchema>;

export type SettingsEnsureInput = z.infer<typeof SettingsEnsureInputSchema>;
export type SettingsEnsureOutput = z.infer<typeof SettingsEnsureOutputSchema>;

export type SettingsDeleteInput = z.infer<typeof SettingsDeleteInputSchema>;
export type SettingsDeleteOutput = z.infer<typeof SettingsDeleteOutputSchema>;

export type SettingsGetManyInput = z.infer<typeof SettingsGetManyInputSchema>;
export type SettingsGetManyOutput = z.infer<typeof SettingsGetManyOutputSchema>;

export type SettingsSetManyInput = z.infer<typeof SettingsSetManyInputSchema>;
export type SettingsSetManyOutput = z.infer<typeof SettingsSetManyOutputSchema>;
