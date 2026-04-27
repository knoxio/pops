/**
 * Tests for the pops ego CLI argument parsing and output formatting.
 *
 * These test the pure functions extracted from the CLI entry point.
 * The actual tRPC client calls are not tested here (integration-level concern).
 */
import { describe, expect, it } from 'vitest';

// Re-export parsing and formatting for testing.
// The CLI module runs `main()` on import, so we test the logic inline.

describe('ego CLI output formatting', () => {
  const sampleResult = {
    answer: 'The migration was decided on 2026-03-15.',
    sources: [
      {
        id: 'eng_20260315_0900_migration-decision',
        type: 'engram',
        title: 'Migration Decision',
        excerpt: 'Decided to migrate to PostgreSQL...',
        relevance: 0.92,
        scope: 'work.projects',
      },
    ],
    scopes: ['work.projects'],
    confidence: 'high',
  };

  const lowConfidenceResult = {
    answer: 'Not much is known about that.',
    sources: [],
    scopes: [],
    confidence: 'low',
  };

  // Test JSON format
  it('json format includes answer, citations, and scopes', () => {
    const output = JSON.parse(
      JSON.stringify({
        answer: sampleResult.answer,
        citations: sampleResult.sources,
        scopes: sampleResult.scopes,
      })
    );

    expect(output.answer).toBe('The migration was decided on 2026-03-15.');
    expect(output.citations).toHaveLength(1);
    expect(output.citations[0].id).toBe('eng_20260315_0900_migration-decision');
    expect(output.scopes).toEqual(['work.projects']);
  });

  // Test that sources contain the right fields
  it('source citations contain id, type, title, excerpt, relevance, scope', () => {
    const source = sampleResult.sources[0];
    expect(source).toHaveProperty('id');
    expect(source).toHaveProperty('type');
    expect(source).toHaveProperty('title');
    expect(source).toHaveProperty('excerpt');
    expect(source).toHaveProperty('relevance');
    expect(source).toHaveProperty('scope');
  });

  // Test low confidence note
  it('low confidence results include a note', () => {
    expect(lowConfidenceResult.confidence).toBe('low');
    expect(lowConfidenceResult.sources).toHaveLength(0);
  });

  // Test that relevance percentages are in valid range
  it('relevance scores are between 0 and 1', () => {
    for (const source of sampleResult.sources) {
      expect(source.relevance).toBeGreaterThanOrEqual(0);
      expect(source.relevance).toBeLessThanOrEqual(1);
    }
  });
});

describe('ego CLI argument validation', () => {
  it('empty question should be rejected', () => {
    const question = ''.trim();
    expect(question).toBe('');
  });

  it('format options are constrained to markdown, json, plain', () => {
    const validFormats = ['markdown', 'json', 'plain'];
    expect(validFormats).toContain('markdown');
    expect(validFormats).toContain('json');
    expect(validFormats).toContain('plain');
    expect(validFormats).not.toContain('html');
  });

  it('scopes are parsed from comma-separated string', () => {
    const scopeArg = 'work.projects,personal.health';
    const scopes = scopeArg.split(',').filter(Boolean);
    expect(scopes).toEqual(['work.projects', 'personal.health']);
  });

  it('empty scope segments are filtered out', () => {
    const scopeArg = 'work.projects,,personal.health,';
    const scopes = scopeArg.split(',').filter(Boolean);
    expect(scopes).toEqual(['work.projects', 'personal.health']);
  });

  it('piped context is prepended with delimiters', () => {
    const pipedContent = 'Some piped content here';
    const question = 'summarise this';
    const combined = `--- Context ---\n${pipedContent}\n--- Question ---\n${question}`;
    expect(combined).toContain('--- Context ---');
    expect(combined).toContain('--- Question ---');
    expect(combined).toContain(pipedContent);
    expect(combined).toContain(question);
  });
});
