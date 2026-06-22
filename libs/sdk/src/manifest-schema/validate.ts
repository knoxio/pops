import { ManifestPayloadSchema, type ManifestPayload } from './schema.js';

import type { ZodError } from 'zod';

type ZodIssue = ZodError['issues'][number];

export type ValidationIssue = {
  field: string;
  reason: string;
  got: unknown;
  schemaPath: readonly (string | number)[];
};

export type ValidationResult =
  | { ok: true; payload: ManifestPayload }
  | { ok: false; issues: ValidationIssue[] };

export function validateManifestPayload(input: unknown): ValidationResult {
  const parsed = ManifestPayloadSchema.safeParse(input);

  if (!parsed.success) {
    const issues = parsed.error.issues.flatMap((issue) => mapZodIssue(issue, input));
    return { ok: false, issues };
  }

  const crossFieldIssues = [
    ...checkContractPackageMatchesPillar(parsed.data),
    ...checkContractTagMatchesVersion(parsed.data),
    ...checkAiToolAllowedUriTypesAreDeclared(parsed.data),
    ...checkSearchAdapterProceduresAreDeclared(parsed.data),
  ];

  if (crossFieldIssues.length > 0) {
    return { ok: false, issues: crossFieldIssues };
  }

  return { ok: true, payload: parsed.data };
}

function mapZodIssue(issue: ZodIssue, input: unknown): ValidationIssue[] {
  if (issue.code === 'unrecognized_keys') {
    return issue.keys.map((key) => {
      const childPath: (string | number)[] = [...toStringNumberPath(issue.path), key];
      return {
        field: pathToDotted(childPath),
        reason: 'unknown field',
        got: walkPath(input, childPath),
        schemaPath: childPath,
      };
    });
  }

  const path = toStringNumberPath(issue.path);
  return [
    {
      field: pathToDotted(path),
      reason: issue.message,
      got: walkPath(input, path),
      schemaPath: path,
    },
  ];
}

function toStringNumberPath(path: ReadonlyArray<PropertyKey>): (string | number)[] {
  return path.map((segment) => {
    if (typeof segment === 'number') return segment;
    if (typeof segment === 'string') return segment;
    return segment.toString();
  });
}

export function pathToDotted(path: ReadonlyArray<string | number>): string {
  let out = '';
  for (const segment of path) {
    if (typeof segment === 'number') {
      out += `[${segment}]`;
      continue;
    }
    out = out.length === 0 ? segment : `${out}.${segment}`;
  }
  return out;
}

function walkPath(input: unknown, path: ReadonlyArray<string | number>): unknown {
  let current: unknown = input;
  for (const segment of path) {
    if (current === null || current === undefined) return undefined;
    if (typeof segment === 'number') {
      if (!Array.isArray(current)) return undefined;
      current = current[segment];
      continue;
    }
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

export function checkContractPackageMatchesPillar(payload: ManifestPayload): ValidationIssue[] {
  const legacy = `@pops/${payload.pillar}-contract`;
  const collapsed = `@pops/${payload.pillar}`;
  if (payload.contract.package === legacy || payload.contract.package === collapsed) return [];
  return [
    {
      field: 'contract.package',
      reason: `must match pillar id: expected ${legacy} or ${collapsed}, got ${payload.contract.package}`,
      got: payload.contract.package,
      schemaPath: ['contract', 'package'],
    },
  ];
}

export function checkContractTagMatchesVersion(payload: ManifestPayload): ValidationIssue[] {
  const expected = `contract-${payload.pillar}@v${payload.contract.version}`;
  if (payload.contract.tag === expected) return [];
  return [
    {
      field: 'contract.tag',
      reason: `must match contract version: expected ${expected}, got ${payload.contract.tag}`,
      got: payload.contract.tag,
      schemaPath: ['contract', 'tag'],
    },
  ];
}

/**
 * Each search adapter's `procedurePath` must reference a procedure the
 * pillar actually exposes (a `routes.queries` or `routes.mutations` entry).
 * PRD-196 business rule: an adapter cannot fan out to a procedure the
 * pillar doesn't serve.
 */
export function checkSearchAdapterProceduresAreDeclared(
  payload: ManifestPayload
): ValidationIssue[] {
  const declared = new Set<string>([...payload.routes.queries, ...payload.routes.mutations]);
  const issues: ValidationIssue[] = [];
  payload.search.adapters.forEach((adapter, adapterIndex) => {
    if (declared.has(adapter.procedurePath)) return;
    const path: (string | number)[] = ['search', 'adapters', adapterIndex, 'procedurePath'];
    issues.push({
      field: pathToDotted(path),
      reason: `procedurePath '${adapter.procedurePath}' is not declared in routes.queries or routes.mutations`,
      got: adapter.procedurePath,
      schemaPath: path,
    });
  });
  return issues;
}

/**
 * Each AI tool's `allowedUriTypes` (if declared) must be a subset of the
 * pillar's `uri.types`. PRD-200 business rule: a tool cannot reference a
 * URI type the pillar does not actually expose.
 */
export function checkAiToolAllowedUriTypesAreDeclared(payload: ManifestPayload): ValidationIssue[] {
  const declared = new Set(payload.uri.types);
  const issues: ValidationIssue[] = [];
  payload.ai.tools.forEach((tool, toolIndex) => {
    const allowed = tool.allowedUriTypes;
    if (!allowed) return;
    allowed.forEach((uriType, uriIndex) => {
      if (declared.has(uriType)) return;
      const path: (string | number)[] = ['ai', 'tools', toolIndex, 'allowedUriTypes', uriIndex];
      issues.push({
        field: pathToDotted(path),
        reason: `allowedUriTypes entry '${uriType}' is not declared in uri.types`,
        got: uriType,
        schemaPath: path,
      });
    });
  });
  return issues;
}
