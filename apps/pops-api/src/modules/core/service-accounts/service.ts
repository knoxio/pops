/**
 * Thin wrapper around `@pops/core-db`'s service-accounts service.
 *
 * Resolves the singleton `getDrizzle()` handle and forwards. Translates
 * the package's typed errors to the HTTP-layer error variants the rest of
 * pops-api still expects (`NotFoundError`, `ValidationError`, `HttpError`)
 * so the global error handler keeps producing the same status codes and
 * i18n keys it did before the core pillar Phase 1 split.
 *
 * This shim is deleted in Phase 1 PR 4. Existing callers (`trpc.ts`,
 * `router.ts`, `service.test.ts`) keep importing from here unchanged; the
 * deletion PR also flips them to the package directly and drops this file.
 */
import {
  serviceAccountsService,
  ServiceAccountAlreadyRevokedError,
  ServiceAccountNameAlreadyExistsError,
  ServiceAccountNotFoundError,
} from '@pops/core-db';

import { getDrizzle } from '../../../db.js';
import { HttpError, NotFoundError, ValidationError } from '../../../shared/errors.js';

import type {
  AuthenticatedServiceAccount as PackageAuthenticatedServiceAccount,
  CreateServiceAccountInput as PackageCreateServiceAccountInput,
  CreatedServiceAccount as PackageCreatedServiceAccount,
  ServiceAccount as PackageServiceAccount,
} from '@pops/core-db';

export type AuthenticatedServiceAccount = PackageAuthenticatedServiceAccount;
export type ServiceAccount = PackageServiceAccount;
export type CreatedServiceAccount = PackageCreatedServiceAccount;

export async function createServiceAccount(
  input: PackageCreateServiceAccountInput,
  createdBy: string | null
): Promise<CreatedServiceAccount> {
  try {
    return await serviceAccountsService.createServiceAccount(getDrizzle(), input, createdBy);
  } catch (err) {
    if (err instanceof ServiceAccountNameAlreadyExistsError) {
      throw new ValidationError({ message: err.message });
    }
    throw err;
  }
}

export function listServiceAccounts(): ServiceAccount[] {
  return serviceAccountsService.listServiceAccounts(getDrizzle());
}

export function revokeServiceAccount(id: string): void {
  try {
    serviceAccountsService.revokeServiceAccount(getDrizzle(), id);
  } catch (err) {
    if (err instanceof ServiceAccountNotFoundError) {
      throw new NotFoundError('ServiceAccount', id);
    }
    if (err instanceof ServiceAccountAlreadyRevokedError) {
      throw new HttpError(409, err.message);
    }
    throw err;
  }
}

export async function authenticateServiceAccount(
  prefix: string,
  secret: string
): Promise<AuthenticatedServiceAccount | null> {
  return serviceAccountsService.authenticateServiceAccount(getDrizzle(), prefix, secret);
}

export function hasScopeFor(grantedScopes: string[], procedurePath: string): boolean {
  return serviceAccountsService.hasScopeFor(grantedScopes, procedurePath);
}

export function getActiveServiceAccountByPrefix(prefix: string): ServiceAccount | null {
  return serviceAccountsService.getActiveServiceAccountByPrefix(getDrizzle(), prefix);
}

export function countActiveServiceAccounts(): number {
  return serviceAccountsService.countActiveServiceAccounts(getDrizzle());
}
