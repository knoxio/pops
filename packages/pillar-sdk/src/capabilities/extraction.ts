import type { BaseContract } from './base-contract.js';

/**
 * Barrel projections: lift the named sub-objects of a `<Pillar>Contract` into
 * their own type aliases so consumers can write `RoutesOf<FinanceContract>`
 * rather than `FinanceContract['router']`. Pure indexed access; the value is
 * the documentation.
 */

export type RoutesOf<C extends BaseContract> = C['router'];
export type EntitiesOf<C extends BaseContract> = C['types'];
export type SchemasOf<C extends BaseContract> = C['schemas'];
export type ErrorsOf<C extends BaseContract> = C['errors'];
