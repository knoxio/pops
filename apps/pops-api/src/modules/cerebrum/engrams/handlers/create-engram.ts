import { ValidationError } from '../../../../shared/errors.js';
import { applyTemplate } from '../../templates/apply.js';
import { serializeEngram } from '../file.js';
import { generateEngramId } from '../id.js';
import { absolutePath, assertSafeType, dedupe, isIdTaken, writeFileAtomic } from './fs-helpers.js';
import { upsertIndex } from './upsert-index.js';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import type { TemplateRegistry } from '../../templates/registry.js';
import type { EngramFrontmatter, EngramSource } from '../schema.js';
import type { ScopeRuleEngine } from '../scope-rules.js';

export type CreateDeps = {
  root: string;
  db: BetterSQLite3Database;
  templates: TemplateRegistry;
  scopeRuleEngine?: ScopeRuleEngine;
  now: () => Date;
};

export interface CreateEngramInput {
  type: string;
  title: string;
  body?: string;
  scopes?: string[];
  tags?: string[];
  template?: string;
  customFields?: Record<string, unknown>;
  source?: EngramSource;
  links?: string[];
}

interface ResolvedTemplate {
  body: string;
  customFields: Record<string, unknown>;
  type: string;
  templateName: string | undefined;
  mergedScopes: string[];
}

function resolveTemplate(
  templates: TemplateRegistry,
  input: CreateEngramInput,
  scopes: string[],
  initialType: string
): ResolvedTemplate {
  const baseFields: Record<string, unknown> = input.customFields ?? {};
  if (!input.template) {
    return {
      body: input.body ?? '',
      customFields: baseFields,
      type: initialType,
      templateName: undefined,
      mergedScopes: scopes,
    };
  }

  const template = templates.get(input.template);
  if (!template) {
    console.warn(
      `[cerebrum] Template '${input.template}' not found — falling back to a 'capture' engram.`
    );
    return {
      body: input.body ?? '',
      customFields: baseFields,
      type: 'capture',
      templateName: undefined,
      mergedScopes: scopes,
    };
  }

  const applied = applyTemplate({
    template,
    title: input.title,
    body: input.body,
    scopes,
    customFields: baseFields,
  });
  return {
    body: applied.body,
    customFields: applied.customFields,
    type: initialType,
    templateName: input.template,
    mergedScopes: applied.scopes,
  };
}

function buildFrontmatter(args: {
  id: string;
  type: string;
  mergedScopes: string[];
  nowIso: string;
  source: EngramSource;
  tags: string[];
  links: string[] | undefined;
  templateName: string | undefined;
  customFields: Record<string, unknown>;
}): EngramFrontmatter {
  const { id, type, mergedScopes, nowIso, source, tags, links, templateName, customFields } = args;
  return {
    id,
    type,
    scopes: dedupe(mergedScopes),
    created: nowIso,
    modified: nowIso,
    source,
    status: 'active',
    ...(tags.length > 0 ? { tags: dedupe(tags) } : {}),
    ...(links && links.length > 0 ? { links: dedupe(links) } : {}),
    ...(templateName ? { template: templateName } : {}),
    ...customFields,
  };
}

export function createEngram(deps: CreateDeps, input: CreateEngramInput): string {
  const { root, db, templates, scopeRuleEngine, now } = deps;
  const scopes = input.scopes ?? [];
  const tags = input.tags ?? [];
  const source = input.source ?? 'manual';

  if (scopes.length === 0 && !input.template && !scopeRuleEngine) {
    throw new ValidationError({ message: 'at least one scope is required' });
  }

  const resolved = resolveTemplate(templates, input, scopes, input.type || 'capture');
  let mergedScopes = resolved.mergedScopes;
  if (mergedScopes.length === 0 && scopeRuleEngine) {
    mergedScopes = scopeRuleEngine.inferScopes({
      source,
      type: resolved.type,
      tags,
      explicitScopes: [],
    });
  }
  if (mergedScopes.length === 0) {
    throw new ValidationError({ message: 'at least one scope is required' });
  }

  assertSafeType(resolved.type);

  const id = generateEngramId({
    title: input.title,
    now: now(),
    isTaken: (candidate) => isIdTaken(db, root, candidate, resolved.type),
  });

  const nowIso = now().toISOString();
  const frontmatter = buildFrontmatter({
    id,
    type: resolved.type,
    mergedScopes,
    nowIso,
    source,
    tags,
    links: input.links,
    templateName: resolved.templateName,
    customFields: resolved.customFields,
  });

  const relPath = `${resolved.type}/${id}.md`;
  writeFileAtomic(absolutePath(root, relPath), serializeEngram(frontmatter, resolved.body));
  upsertIndex(db, {
    id,
    filePath: relPath,
    frontmatter,
    body: resolved.body,
    customFields: resolved.customFields,
  });

  return id;
}
