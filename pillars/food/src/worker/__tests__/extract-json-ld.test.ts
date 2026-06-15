/**
 * PRD-127 — JSON-LD extractor unit tests.
 */
import { describe, expect, it } from 'vitest';

import { extractRecipeJsonLd } from '../handlers/web/extract-json-ld.js';

function scriptHtml(json: object): string {
  return `<html><head><script type="application/ld+json">${JSON.stringify(json)}</script></head><body></body></html>`;
}

describe('extractRecipeJsonLd', () => {
  it('finds a top-level Recipe', () => {
    const html = scriptHtml({
      '@type': 'Recipe',
      name: 'X',
      recipeIngredient: [],
      recipeInstructions: [],
    });
    const out = extractRecipeJsonLd(html);
    expect(out?.name).toBe('X');
  });

  it('finds a Recipe inside @graph', () => {
    const html = scriptHtml({
      '@graph': [{ '@type': 'WebSite' }, { '@type': 'Recipe', name: 'Inside Graph' }],
    });
    expect(extractRecipeJsonLd(html)?.name).toBe('Inside Graph');
  });

  it('finds a Recipe in mainEntity', () => {
    const html = scriptHtml({
      '@type': 'WebPage',
      mainEntity: { '@type': 'Recipe', name: 'Main Entity Recipe' },
    });
    expect(extractRecipeJsonLd(html)?.name).toBe('Main Entity Recipe');
  });

  it('returns null when the page only has non-Recipe JSON-LD', () => {
    const html = scriptHtml({ '@type': 'Article', headline: 'hi' });
    expect(extractRecipeJsonLd(html)).toBeNull();
  });

  it('returns null when there are no JSON-LD blocks at all', () => {
    expect(extractRecipeJsonLd('<html><body><h1>nope</h1></body></html>')).toBeNull();
  });

  it('skips malformed JSON-LD blocks but still finds a later valid Recipe', () => {
    const malformed = '<script type="application/ld+json">{ not json }</script>';
    const good = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Recipe',
      name: 'Recovered',
    })}</script>`;
    const html = `<html><head>${malformed}${good}</head></html>`;
    expect(extractRecipeJsonLd(html)?.name).toBe('Recovered');
  });

  it('handles array of typed nodes', () => {
    const html = scriptHtml([
      { '@type': 'BreadcrumbList' },
      { '@type': 'Recipe', name: 'Array Item' },
    ] as unknown as object);
    expect(extractRecipeJsonLd(html)?.name).toBe('Array Item');
  });

  it('matches schema.org/Recipe absolute @type', () => {
    const html = scriptHtml({ '@type': 'https://schema.org/Recipe', name: 'Abs Type' });
    expect(extractRecipeJsonLd(html)?.name).toBe('Abs Type');
  });

  it('matches Recipe in an @type array', () => {
    const html = scriptHtml({
      '@type': ['Thing', 'Recipe'],
      name: 'Multi Type',
    });
    expect(extractRecipeJsonLd(html)?.name).toBe('Multi Type');
  });
});
