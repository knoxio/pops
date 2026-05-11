/**
 * Pure helpers for translating the documents form state into the shape
 * the `cerebrum.emit.generate` / `.preview` procedures expect, plus
 * validation that mirrors the server-side rules. Extracted so the page
 * stays under the line/complexity limits and so tests can target the
 * mapping logic directly.
 */
import type { DateRange, DocumentsFormState, GenerationMode } from './types';

export interface ValidatedRequest {
  mode: GenerationMode;
  query?: string;
  dateRange?: DateRange;
  audienceScope?: string;
  includeSecret?: boolean;
  scopes?: string[];
  tags?: string[];
}

export type ValidationError =
  | { kind: 'queryRequired' }
  | { kind: 'dateRangeRequired' }
  | { kind: 'dateRangeOrder' };

function splitList(raw: string): string[] | undefined {
  const items = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return items.length > 0 ? items : undefined;
}

function buildDateRange(form: DocumentsFormState): DateRange | undefined {
  if (!form.dateFrom || !form.dateTo) return undefined;
  return { from: form.dateFrom, to: form.dateTo };
}

/**
 * Validate the form. Returns the typed request payload on success, or a
 * discriminated `ValidationError` describing the first failure on
 * error.
 */
function firstValidationError(
  form: DocumentsFormState,
  dateRange: DateRange | undefined
): ValidationError | null {
  if (form.mode === 'report' && form.query.trim().length === 0) {
    return { kind: 'queryRequired' };
  }
  if (form.mode === 'summary' && !dateRange) {
    return { kind: 'dateRangeRequired' };
  }
  if (dateRange && dateRange.from > dateRange.to) {
    return { kind: 'dateRangeOrder' };
  }
  return null;
}

function buildValidatedRequest(
  form: DocumentsFormState,
  dateRange: DateRange | undefined
): ValidatedRequest {
  const request: ValidatedRequest = { mode: form.mode };
  const trimmedQuery = form.query.trim();
  if (trimmedQuery.length > 0) request.query = trimmedQuery;
  if (dateRange) request.dateRange = dateRange;
  const trimmedAudience = form.audienceScope.trim();
  if (trimmedAudience.length > 0) request.audienceScope = trimmedAudience;
  if (form.includeSecret) request.includeSecret = true;
  const scopes = splitList(form.scopes);
  if (scopes) request.scopes = scopes;
  const tags = splitList(form.tags);
  if (tags) request.tags = tags;
  return request;
}

export function validateForm(
  form: DocumentsFormState
): { ok: true; request: ValidatedRequest } | { ok: false; error: ValidationError } {
  const dateRange = buildDateRange(form);
  const error = firstValidationError(form, dateRange);
  if (error) return { ok: false, error };
  return { ok: true, request: buildValidatedRequest(form, dateRange) };
}

export function errorMessageKey(error: ValidationError): string {
  switch (error.kind) {
    case 'queryRequired':
      return 'documents.form.errors.queryRequired';
    case 'dateRangeRequired':
      return 'documents.form.errors.dateRangeRequired';
    case 'dateRangeOrder':
      return 'documents.form.errors.dateRangeOrder';
  }
}
