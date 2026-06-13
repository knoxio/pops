export { pillar, __resetSharedPillarClient } from './factory.js';
export type { PillarClientOptions } from './factory.js';
export type { CallableProcedure, CallDynamicFn, PillarHandle, ProcedureKind } from './proxy.js';
export { DiscoveryCache } from './cache.js';
export {
  HttpDiscoveryTransport,
  type DiscoveredPillar,
  type DiscoveryTransport,
  type HttpDiscoveryTransportOptions,
} from './discovery.js';
export {
  PillarCallError,
  PillarSdkError,
  isOk,
  type CallFailure,
  type CallResult,
  type CallSuccess,
} from './errors.js';
