import { describe, expect, it } from 'vitest';

import {
  countWords,
  deriveTitle,
  EngramParseError,
  parseEngramFile,
  serializeEngram,
} from './file.js';
import { canTransitionStatus, type EngramFrontmatter } from './schema.js';

const BASE_FRONTMATTER: EngramFrontmatter = {
  id: 'eng_20260418_0900_hello-world',
  type: 'note',
  scopes: ['personal.notes'],
  created: '2026-04-18T09:00:00+10:00',
  modified: '2026-04-18T09:00:00+10:00',
  source: 'manual',
  status: 'active',
};

describe('parseEngramFile', () => {
  it('validates a well-formed engram', () => {
    const file = [
      '---',
      `id: ${BASE_FRONTMATTER.id}`,
      `type: ${BASE_FRONTMATTER.type}`,
      'scopes:',
      '  - personal.notes',
      `created: ${BASE_FRONTMATTER.created}`,
      `modified: ${BASE_FRONTMATTER.modified}`,
      `source: ${BASE_FRONTMATTER.source}`,
      `status: ${BASE_FRONTMATTER.status}`,
      '---',
      '',
      '# Hello World',
      '',
      'Body text.',
      '',
    ].join('\n');

    const { frontmatter, body } = parseEngramFile(file);
    expect(frontmatter.id).toBe(BASE_FRONTMATTER.id);
    expect(frontmatter.scopes).toEqual(['personal.notes']);
    expect(body).toContain('# Hello World');
  });

  it('rejects frontmatter missing required fields', () => {
    const file = '---\ntype: note\n---\n\nbody';
    expect(() => parseEngramFile(file)).toThrow(EngramParseError);
  });

  it('accepts plexus: prefixed sources', () => {
    const file = serializeEngram({ ...BASE_FRONTMATTER, source: 'plexus:github' }, '# hi');
    const { frontmatter } = parseEngramFile(file);
    expect(frontmatter.source).toBe('plexus:github');
  });

  it('rejects unknown source channels', () => {
    const bad = `---\n${[
      `id: ${BASE_FRONTMATTER.id}`,
      'type: note',
      'scopes:',
      '  - personal.notes',
      `created: ${BASE_FRONTMATTER.created}`,
      `modified: ${BASE_FRONTMATTER.modified}`,
      'source: smoke-signal',
      'status: active',
    ].join('\n')}\n---\n\nbody\n`;
    expect(() => parseEngramFile(bad)).toThrow(EngramParseError);
  });

  it('preserves template-defined custom fields', () => {
    const fm = { ...BASE_FRONTMATTER, template: 'decision', outcome: 'pending' };
    const file = serializeEngram(fm as EngramFrontmatter, '# Decision');
    const { frontmatter } = parseEngramFile(file);
    expect((frontmatter as Record<string, unknown>)['outcome']).toBe('pending');
  });
});

describe('serializeEngram', () => {
  it('round-trips', () => {
    const serialized = serializeEngram(BASE_FRONTMATTER, '# Hi\n\nBody.');
    const { frontmatter, body } = parseEngramFile(serialized);
    expect(frontmatter).toMatchObject(BASE_FRONTMATTER);
    expect(body.trim()).toBe('# Hi\n\nBody.');
  });

  it('throws on invalid frontmatter at serialize time', () => {
    expect(() =>
      serializeEngram({ ...BASE_FRONTMATTER, scopes: [] } as EngramFrontmatter, 'body')
    ).toThrow();
  });
});

describe('deriveTitle', () => {
  it('returns the first H1', () => {
    expect(deriveTitle('\n# The Title\n\nbody')).toBe('The Title');
  });

  it('falls back to the first non-empty line when no H1', () => {
    expect(deriveTitle('\n\nA plain line\nlater line')).toBe('A plain line');
  });

  it('returns Untitled for empty body', () => {
    expect(deriveTitle('   \n\n')).toBe('Untitled');
  });
});

describe('countWords', () => {
  it('counts whitespace-delimited tokens', () => {
    expect(countWords('one two  three\nfour')).toBe(4);
  });

  it('returns 0 for empty body', () => {
    expect(countWords('   \n\n')).toBe(0);
  });
});

describe('canTransitionStatus', () => {
  it('permits active to archived', () => {
    expect(canTransitionStatus('active', 'archived')).toBe(true);
  });

  it('treats consolidated and stale as terminal', () => {
    expect(canTransitionStatus('consolidated', 'active')).toBe(false);
    expect(canTransitionStatus('stale', 'active')).toBe(false);
  });

  it('allows restoring archived to active', () => {
    expect(canTransitionStatus('archived', 'active')).toBe(true);
  });
});
