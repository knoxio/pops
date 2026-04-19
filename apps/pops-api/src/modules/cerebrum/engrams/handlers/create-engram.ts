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

export function createEngram(deps: CreateDeps, input: CreateEngramInput): string {
  const { root, db, templates, scopeRuleEngine, now } = deps;
  const scopes = input.scopes ?? [];
  const tags = input.tags ?? [];
  const source = input.source ?? 'manual';

  if (scopes.length === 0 && !input.template && !scopeRuleEngine) {
    throw new ValidationError({ message: 'at least one scope is required' });
  }

  let body = input.body ?? '';
  let customFields: Record<string, unknown> = input.customFields ?? {};
  let templateName: string | undefined = input.template;
  let mergedScopes = scopes;
  let type = input.type || 'capture';

  if (templateName) {
    const template = templates.get(templateName);
    if (!template) {
      console.warn(
        `[cerebrum] Template '${templateName}' not found — falling back to a 'capture' engram.`
      );
      templateName = undefined;
      type = 'capture';
    } else {
      const applied = applyTemplate({
        template,
        title: input.title,
        body: input.body,
        scopes,
        customFields,
      });
      body = applied.body;
      mergedScopes = applied.scopes;
      customFields = applied.customFields;
    }
  }

  if (mergedScopes.length === 0 && scopeRuleEngine) {
    mergedScopes = scopeRuleEngine.inferScopes({ source, type, tags, explicitScopes: [] });
  }

  if (mergedScopes.length === 0) {
    throw new ValidationError({ message: 'at least one scope is required' });
  }

  assertSafeType(type);

  const id = generateEngramId({
    title: input.title,
    now: now(),
    isTaken: (candidate) => isIdTaken(db, root, candidate, type),
  });

  const nowIso = now().toISOString();
  const frontmatter: EngramFrontmatter = {
    id,
    type,
    scopes: dedupe(mergedScopes),
    created: nowIso,
    modified: nowIso,
    source,
    status: 'active',
    ...(tags.length > 0 ? { tags: dedupe(tags) } : {}),
    ...(input.links && input.links.length > 0 ? { links: dedupe(input.links) } : {}),
    ...(templateName ? { template: templateName } : {}),
    ...customFields,
  };

  const relPath = `${type}/${id}.md`;
  writeFileAtomic(absolutePath(root, relPath), serializeEngram(frontmatter, body));
  upsertIndex(db, { id, filePath: relPath, frontmatter, body, customFields });

  return id;
}
