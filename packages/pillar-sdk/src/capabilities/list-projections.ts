import type { BaseContract } from './base-contract.js';

/**
 * List-to-union projections: the contract advertises a `readonly string[]`
 * (or, for AI tools, a `readonly { name; ... }[]`) and the projection lifts
 * it to a string union so consumer call sites get autocomplete + typo
 * detection.
 *
 * If a list is empty, the projected union is `never` — TypeScript then
 * statically refuses any value at the call site, which is the correct
 * behaviour (there is nothing legal to pass).
 */

export type SearchAdaptersOf<C extends BaseContract> = C['search']['adapters'][number];

export type UriTypesOf<C extends BaseContract> = C['uri']['types'][number];

export type SettingsKeysOf<C extends BaseContract> = C['settings']['keys'][number];

export type AiToolNamesOf<C extends BaseContract> = C['ai']['tools'][number]['name'];
