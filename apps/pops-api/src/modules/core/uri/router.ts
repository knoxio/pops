/**
 * `core.uri.resolve` — platform-wide URI dispatcher (PRD-101 US-08, ADR-012).
 *
 * Single read-path the AI overlay, universal-search click handler, and
 * deep-link routing call to convert a `pops:{moduleId}/{type}/{id}` URI
 * into a typed payload. Returns a discriminated `UriResolverResult` so
 * callers render placeholders for missing modules / records / malformed
 * input rather than handle exceptions.
 */
import { z } from 'zod';

import { protectedProcedure, router } from '../../../trpc.js';
import { readInstalledModules } from '../../env-modules.js';
import { getUriRegistry } from './registry.js';
import { resolveUri } from './resolver.js';

/**
 * Output schema for `core.uri.resolve`.
 *
 * Mirrors the `UriResolverResult` discriminated union from `@pops/types`.
 * `data` is opaque from the schema's perspective — each handler returns its
 * own typed shape; the consumer narrows by `(moduleId, type)` before
 * rendering.
 */
const UriResolverResultSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('object'),
    moduleId: z.string(),
    type: z.string(),
    id: z.string(),
    data: z.unknown(),
  }),
  z.object({
    kind: z.literal('not-found'),
    moduleId: z.string(),
    type: z.string(),
    id: z.string(),
  }),
  z.object({
    kind: z.literal('module-absent'),
    moduleId: z.string(),
  }),
  z.object({
    kind: z.literal('pillar-unavailable'),
    moduleId: z.string(),
    reason: z.string(),
  }),
  z.object({
    kind: z.literal('malformed'),
    uri: z.string(),
    reason: z.string(),
  }),
]);

const UriInputSchema = z.object({ uri: z.string().min(1) });

export const uriRouter = router({
  resolve: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/uri/resolve',
        summary: 'Resolve a pops:{module}/{type}/{id} URI',
        tags: ['core'],
      },
    })
    .input(UriInputSchema)
    .output(UriResolverResultSchema)
    .query(async ({ input }) => {
      const installed = readInstalledModules();
      const installedSet = new Set<string>(['core', ...installed.apps, ...installed.overlays]);
      return resolveUri(input.uri, {
        registry: getUriRegistry(),
        isInstalled: (moduleId) => installedSet.has(moduleId),
      });
    }),
});
