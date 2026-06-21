/**
 * Pure helpers for translating the Query form state into the payload
 * `cerebrum.query.ask` expects, plus the validation rules that mirror
 * the server-side schema. Extracted from the view model so the page
 * stays under the line/complexity limits and so the mapping logic is
 * unit-testable in isolation.
 */
import { QUERY_DOMAINS, type QueryDomain, type QueryFormState } from './types';

export interface ValidatedQueryRequest {
  question: string;
  scopes?: string[];
  domains?: QueryDomain[];
  includeSecret?: boolean;
}

export type QueryValidationError = { kind: 'questionRequired' };

function splitScopes(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function isQueryDomain(value: string): value is QueryDomain {
  return (QUERY_DOMAINS as readonly string[]).includes(value);
}

/** Normalise an arbitrary string list into the typed `QueryDomain[]`. */
export function coerceDomains(values: readonly string[]): QueryDomain[] {
  return values.filter(isQueryDomain);
}

/**
 * Validate the form. Returns the typed request on success, or a
 * discriminated error describing the first failure.
 */
export function validateQueryForm(
  form: QueryFormState
): { ok: true; request: ValidatedQueryRequest } | { ok: false; error: QueryValidationError } {
  const question = form.question.trim();
  if (question.length === 0) {
    return { ok: false, error: { kind: 'questionRequired' } };
  }
  const request: ValidatedQueryRequest = { question };
  const scopes = splitScopes(form.scopes);
  if (scopes.length > 0) request.scopes = scopes;
  if (form.domains.length > 0) request.domains = form.domains;
  if (form.includeSecret) request.includeSecret = true;
  return { ok: true, request };
}

export function queryErrorMessageKey(error: QueryValidationError): string {
  switch (error.kind) {
    case 'questionRequired':
      return 'query.form.errors.questionRequired';
  }
}
