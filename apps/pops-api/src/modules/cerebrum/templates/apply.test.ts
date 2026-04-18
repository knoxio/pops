import { describe, expect, it } from 'vitest';

import { ValidationError } from '../../../shared/errors.js';
import { applyTemplate } from './apply.js';

import type { Template } from './schema.js';

const decisionTemplate: Template = {
  name: 'decision',
  description: 'A decision',
  required_fields: ['decision'],
  suggested_sections: ['Context', 'Decision'],
  default_scopes: ['work'],
  custom_fields: {
    decision: { type: 'string', description: 'what was decided' },
    alternatives: { type: 'string[]', description: 'options' },
    confidence: { type: 'string', description: 'low|medium|high' },
  },
  body: '# {{title}}\n\n## Decision\n\n{{decision}}\n',
};

describe('applyTemplate', () => {
  it('merges default_scopes with user scopes without duplication', () => {
    const result = applyTemplate({
      template: decisionTemplate,
      title: 'Pick runtime',
      scopes: ['work', 'personal'],
      customFields: { decision: 'Node' },
    });
    expect(result.scopes).toEqual(['work', 'personal']);
  });

  it('throws when a required field is missing', () => {
    expect(() =>
      applyTemplate({
        template: decisionTemplate,
        title: 'Pick runtime',
        scopes: [],
        customFields: {},
      })
    ).toThrow(ValidationError);
  });

  it('replaces {{title}} and field placeholders in the body', () => {
    const result = applyTemplate({
      template: decisionTemplate,
      title: 'Pick runtime',
      scopes: [],
      customFields: { decision: 'Use Node' },
    });
    expect(result.body).toContain('# Pick runtime');
    expect(result.body).toContain('## Decision\n\nUse Node');
  });

  it('serialises array fields with comma separation in placeholders', () => {
    const t: Template = {
      ...decisionTemplate,
      body: 'Alts: {{alternatives}}',
      required_fields: [],
    };
    const result = applyTemplate({
      template: t,
      title: 'x',
      scopes: [],
      customFields: { alternatives: ['Bun', 'Deno'] },
    });
    expect(result.body).toBe('Alts: Bun, Deno');
  });

  it('scaffolds body from suggested_sections when the template has no body', () => {
    const t: Template = { ...decisionTemplate, body: '', required_fields: [] };
    const result = applyTemplate({
      template: t,
      title: 'X',
      scopes: [],
      customFields: {},
    });
    expect(result.body).toContain('# X');
    expect(result.body).toContain('## Context');
    expect(result.body).toContain('## Decision');
  });

  it('uses the provided body when given, skipping scaffold', () => {
    const result = applyTemplate({
      template: decisionTemplate,
      title: 'X',
      body: '# custom body',
      scopes: [],
      customFields: { decision: 'Y' },
    });
    expect(result.body).toBe('# custom body');
  });

  it('rejects custom fields that fail type checks', () => {
    expect(() =>
      applyTemplate({
        template: decisionTemplate,
        title: 'X',
        scopes: [],
        customFields: { decision: 'Y', alternatives: 'not-an-array' as unknown as string[] },
      })
    ).toThrow(ValidationError);
  });

  it('drops custom fields the template does not declare', () => {
    const result = applyTemplate({
      template: decisionTemplate,
      title: 'X',
      scopes: [],
      customFields: { decision: 'Y', secret: 'nope' as unknown as string },
    });
    expect(result.customFields).not.toHaveProperty('secret');
    expect(result.customFields['decision']).toBe('Y');
  });
});
