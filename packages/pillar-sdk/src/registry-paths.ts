/**
 * Canonical (new) registry handshake/discovery HTTP paths.
 *
 * Idiomatic slash routes that replace the tRPC-vestigial dotted shape
 * (`/core.registry.*`). The core pillar serves these alongside the legacy
 * dotted paths during the rolling-deploy window; the SDK transport/discovery
 * prefer these and fall back to {@link LEGACY_REGISTRY_PATHS} on a 404.
 */
export const REGISTRY_PATHS = {
  register: '/registry/register',
  heartbeat: '/registry/heartbeat',
  deregister: '/registry/deregister',
  snapshot: '/registry/pillars',
} as const;

/**
 * Legacy (dotted, tRPC-vestigial) registry paths kept alive across the
 * rolling-deploy window so an old-SDK pillar can register against a new core
 * and a new-SDK pillar can fall back against an old core. Removed once every
 * pillar image is on the new SDK and the legacy-path metric reads zero.
 */
export const LEGACY_REGISTRY_PATHS = {
  register: '/core.registry.register',
  heartbeat: '/core.registry.heartbeat',
  deregister: '/core.registry.deregister',
  snapshot: '/core.registry.list',
} as const;

/** A registry operation key shared by the canonical and legacy path maps. */
export type RegistryPathKey = keyof typeof REGISTRY_PATHS;
