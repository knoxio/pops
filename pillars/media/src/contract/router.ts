import type { AnyTRPCRouter } from '@trpc/server';

/**
 * Opaque tRPC router type for the media pillar. Mirrors the finance-contract
 * pattern: until PRD-155 ships the declaration bundler, `MediaRouter` is the
 * generic `AnyTRPCRouter` — consumers using `pillar<MediaRouter>('media')` get
 * a fully opaque `PillarHandle` with no route or procedure keys preserved.
 * The committed OpenAPI snapshot at `openapi/media.openapi.json` is the
 * wire-typed alternative until PRD-155 lands.
 *
 * This shape was previously `typeof mediaRouter` (re-exporting from
 * `@pops/media-api`), but that import-type closed a build-graph cycle
 * (pillar-sdk → media-contract → media-api → pillar-sdk) once
 * `@pops/pillar-sdk/settings` started pulling `arrManifest`, `plexManifest`,
 * `rotationManifest`, and `mediaOperationalManifest` from this package
 * (PRD-239 US-05). PRD-155's declaration bundler will restore the concrete
 * per-procedure types without re-introducing the cycle.
 */
export type MediaRouter = AnyTRPCRouter;
