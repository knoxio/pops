/**
 * Re-export shim for the service-account key primitives.
 *
 * Canonical implementation lives in `@pops/core-db`'s
 * `serviceAccountKeys` namespace. This shim preserves the existing
 * `./key.js` import path during the core pillar Phase 1 cutover; PR 4 of
 * the phase replaces these imports with the package directly and deletes
 * this file.
 */
import { serviceAccountKeys } from '@pops/core-db';

export const generateApiKey = serviceAccountKeys.generateApiKey;
export const parseApiKey = serviceAccountKeys.parseApiKey;
export const verifySecret = serviceAccountKeys.verifySecret;
export type IssuedKey = Awaited<ReturnType<typeof serviceAccountKeys.generateApiKey>>;
