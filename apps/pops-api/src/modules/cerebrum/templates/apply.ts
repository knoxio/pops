/**
 * Apply a template to an engram at creation time.
 *
 * Responsibilities:
 *  - Merge the template's `default_scopes` into the engram scopes.
 *  - Validate that every `required_field` is supplied in customFields.
 *  - Scaffold the body from `suggested_sections` when no body was provided.
 *  - Replace `{{placeholder}}` markers from user-supplied values or
 *    `{{title}}` with the engram title.
 *  - Validate + project customFields against the template's declared types.
 */
import { ValidationError } from '../../../shared/errors.js';

import type { Template, TemplateCustomField } from './schema.js';

export interface ApplyTemplateInput {
  template: Template;
  title: string;
  body?: string;
  scopes: string[];
  customFields?: Record<string, unknown>;
}

export interface ApplyTemplateResult {
  body: string;
  scopes: string[];
  customFields: Record<string, unknown>;
}

export function applyTemplate(input: ApplyTemplateInput): ApplyTemplateResult {
  const { template, title, scopes, customFields = {} } = input;
  const providedBody = input.body?.trim();

  const missing = (template.required_fields ?? []).filter(
    (field) => customFields[field] === undefined || customFields[field] === null
  );
  if (missing.length > 0) {
    throw new ValidationError({
      message: `Template '${template.name}' requires: ${missing.join(', ')}`,
      missing,
    });
  }

  const typedFields = projectCustomFields(template, customFields);

  const scaffold = providedBody ?? scaffoldBody(template, title);
  const body = replacePlaceholders(scaffold, {
    title,
    ...stringifyForPlaceholders(typedFields),
  });

  const mergedScopes = dedupe([...(template.default_scopes ?? []), ...scopes]);

  return { body, scopes: mergedScopes, customFields: typedFields };
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function scaffoldBody(template: Template, title: string): string {
  if (template.body.trim().length > 0) return template.body;
  const sections = template.suggested_sections ?? [];
  const lines = [`# ${title}`, ''];
  for (const section of sections) {
    lines.push(`## ${section}`, '', '', '');
  }
  return lines.join('\n');
}

function replacePlaceholders(body: string, values: Record<string, string>): string {
  return body.replaceAll(/\{\{\s*([\w-]+)\s*\}\}/g, (match, rawKey: string) => {
    const key = rawKey.trim();
    const replacement = values[key];
    return replacement === undefined ? match : replacement;
  });
}

function stringifyForPlaceholders(fields: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined) continue;
    out[key] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return out;
}

/**
 * Validate each custom field against its declared template type and return
 * only the fields the template knows about. Extra unrelated keys are dropped
 * so the engram frontmatter stays close to the template's contract.
 */
function projectCustomFields(
  template: Template,
  input: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const declared = template.custom_fields ?? {};
  for (const [key, spec] of Object.entries(declared)) {
    if (input[key] === undefined) continue;
    assertTypeMatches(key, spec, input[key]);
    out[key] = input[key];
  }
  return out;
}

function assertTypeMatches(key: string, spec: TemplateCustomField, value: unknown): void {
  const isArray = spec.type.endsWith('[]');
  const baseType = isArray ? spec.type.slice(0, -2) : spec.type;
  const check = (v: unknown): boolean => {
    switch (baseType) {
      case 'string':
        return typeof v === 'string';
      case 'number':
        return typeof v === 'number';
      case 'boolean':
        return typeof v === 'boolean';
      default:
        // Reject unknown types loudly instead of silently accepting. The
        // template schema's Zod enum prevents this reaching here at load
        // time, but a registry bypass (e.g. a test injecting a raw Template)
        // would otherwise disable all validation for the field.
        throw new ValidationError({
          message: `Template declares unsupported type '${spec.type}' for field '${key}'`,
        });
    }
  };
  const ok = isArray ? Array.isArray(value) && value.every(check) : check(value);
  if (!ok) {
    throw new ValidationError({
      message: `Field '${key}' should be of type '${spec.type}'`,
    });
  }
}
