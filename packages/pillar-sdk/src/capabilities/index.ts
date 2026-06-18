/**
 * `@pops/pillar-sdk/capabilities` — type-level projections from a
 * `<Pillar>Contract` (PRD-155) to the consumer-facing shapes the `pillar()`
 * SDK (PRD-191), the cross-pillar URI dispatch (Epic 02), and the search
 * registry (Epic 06) all rely on.
 *
 * The module is type-only except for two runtime exports:
 *  - `PillarCallError`, the error class thrown by `.orThrow()`.
 *  - `PILLARS`, the canonical readonly array of pillar ids.
 */

export type { BaseContract, ProcedureShape } from './base-contract.js';
export type { RoutesOf, EntitiesOf, SchemasOf, ErrorsOf } from './extraction.js';
export type {
  SearchAdaptersOf,
  UriTypesOf,
  SettingsKeysOf,
  AiToolNamesOf,
} from './list-projections.js';
export type {
  InputOf,
  OutputOf,
  KindOf,
  CallSignature,
  CallSignatureOrThrow,
} from './procedure.js';
export type { CallResult, CallResultKind } from './call-result.js';
export { PillarCallError } from './call-result.js';
export type { CallablePillar } from './callable-pillar.js';
export type { KnownPillarId } from './known-pillar-id.js';
export { PILLARS } from './known-pillar-id.js';
export type { ModuleId } from './module-id.js';
export { ALL_MODULE_IDS, MODULE_PARENT_PILLAR, isKnownPillarId, isModuleId } from './module-id.js';
