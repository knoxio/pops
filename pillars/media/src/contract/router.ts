/**
 * Opaque router type for the media pillar. `@pops/media` speaks REST now, so
 * there is no concrete tRPC router to import — `MediaRouter` is `unknown`,
 * meaning consumers using `pillar<MediaRouter>('media')` get a fully opaque
 * `PillarHandle` with no route or procedure keys preserved. The committed
 * OpenAPI snapshot at `openapi/media.openapi.json` is the wire-typed
 * alternative (e.g. for the generated Hey API clients).
 *
 * The type name is retained because the generated manifest and the manifest
 * generator scripts reference it as the `router` field type. Mirrors the
 * food-contract `FoodRouter = unknown` shape.
 */
export type MediaRouter = unknown;
