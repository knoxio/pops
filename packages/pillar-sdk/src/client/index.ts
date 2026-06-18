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
  isNotFound,
  isConflict,
  isBadRequest,
  isUnauthorized,
  type CallFailure,
  type CallResult,
  type CallSuccess,
} from './errors.js';
export {
  buildRouteMap,
  type OpenApiDocument,
  type RouteEntry,
  type RouteMap,
} from './openapi-route-map.js';
export { performRestCall, type RestCallContext, type RestRouteSource } from './rest-call.js';
export { getRouteMap, OpenApiSourceCache, __resetSharedOpenApiCache } from './openapi-source.js';
export { performHttpCall, type HttpCallContext } from './http-call.js';
