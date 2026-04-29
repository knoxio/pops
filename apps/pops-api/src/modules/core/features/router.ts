import { TRPCError } from '@trpc/server';
import { z } from 'zod';

/**
 * Feature toggles tRPC router (PRD-094).
 *
 * Exposes manifest discovery, current feature status, and write paths for
 * system-level and per-user toggles.
 */
import { protectedProcedure, router } from '../../../trpc.js';
import { featuresRegistry } from './registry.js';
import * as service from './service.js';
import { FeatureGateError, FeatureNotFoundError, FeatureScopeError } from './service.js';
import { FeatureManifestSchema, FeatureStatusSchema } from './types.js';

function mapServiceError(err: unknown): never {
  if (err instanceof FeatureNotFoundError) {
    throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
  }
  if (err instanceof FeatureGateError) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: err.message });
  }
  if (err instanceof FeatureScopeError) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: err.message });
  }
  throw err;
}

export const featuresRouter = router({
  /** Return all registered feature manifests sorted by order. */
  getManifests: protectedProcedure
    .output(z.object({ manifests: z.array(FeatureManifestSchema) }))
    .query(() => ({ manifests: featuresRegistry.getAll() })),

  /** Return runtime status for every feature, including credential resolution. */
  list: protectedProcedure
    .output(z.object({ features: z.array(FeatureStatusSchema) }))
    .query(({ ctx }) => ({
      features: service.listFeatures({ email: ctx.user.email }),
    })),

  /** Boolean check for a single feature in the current request's user context. */
  isEnabled: protectedProcedure
    .input(z.object({ key: z.string() }))
    .output(z.object({ enabled: z.boolean() }))
    .query(({ input, ctx }) => ({
      enabled: service.isEnabled(input.key, { user: { email: ctx.user.email } }),
    })),

  /** Set the system-level enabled state. Rejects if credentials/capability gate is failing. */
  setEnabled: protectedProcedure
    .input(z.object({ key: z.string(), enabled: z.boolean() }))
    .output(z.object({ enabled: z.boolean() }))
    .mutation(({ input }) => {
      try {
        return { enabled: service.setFeatureEnabled(input.key, input.enabled) };
      } catch (err) {
        mapServiceError(err);
      }
    }),

  /** Set a per-user override (404 when feature is not user-scoped). */
  setUserPreference: protectedProcedure
    .input(z.object({ key: z.string(), enabled: z.boolean() }))
    .output(z.object({ enabled: z.boolean() }))
    .mutation(({ input, ctx }) => {
      try {
        return {
          enabled: service.setUserPreference(input.key, { email: ctx.user.email }, input.enabled),
        };
      } catch (err) {
        mapServiceError(err);
      }
    }),

  /** Remove a per-user override; resolution falls back to the system default. */
  clearUserPreference: protectedProcedure
    .input(z.object({ key: z.string() }))
    .output(z.object({ cleared: z.boolean() }))
    .mutation(({ input, ctx }) => {
      try {
        return { cleared: service.clearUserPreference(input.key, { email: ctx.user.email }) };
      } catch (err) {
        mapServiceError(err);
      }
    }),
});
