/**
 * PRD-127 — recipeInstructions extractor unit tests.
 */
import { describe, expect, it } from 'vitest';

import { extractInstructionTexts } from '../handlers/web/extract-instructions.js';

describe('extractInstructionTexts', () => {
  it('flattens HowToStep array', () => {
    const out = extractInstructionTexts([
      { '@type': 'HowToStep', text: 'Step one.' },
      { '@type': 'HowToStep', text: 'Step two.' },
    ]);
    expect(out).toEqual(['Step one.', 'Step two.']);
  });

  it('flattens HowToSection by inlining itemListElement', () => {
    const out = extractInstructionTexts([
      {
        '@type': 'HowToSection',
        name: 'Prep',
        itemListElement: [
          { '@type': 'HowToStep', text: 'Wash veg.' },
          { '@type': 'HowToStep', text: 'Chop veg.' },
        ],
      },
      {
        '@type': 'HowToSection',
        name: 'Cook',
        itemListElement: [{ '@type': 'HowToStep', text: 'Sauté veg.' }],
      },
    ]);
    expect(out).toEqual(['Wash veg.', 'Chop veg.', 'Sauté veg.']);
  });

  it('falls back to splitting a flat string by sentence boundary', () => {
    const out = extractInstructionTexts(
      'Whisk the eggs. Melt butter in a pan. Pour in eggs and cook.'
    );
    expect(out).toEqual(['Whisk the eggs.', 'Melt butter in a pan.', 'Pour in eggs and cook.']);
  });

  it('strips HTML tags', () => {
    const out = extractInstructionTexts([
      { '@type': 'HowToStep', text: 'Whisk <b>dry</b> ingredients.' },
    ]);
    expect(out).toEqual(['Whisk dry ingredients.']);
  });

  it('drops empty steps', () => {
    const out = extractInstructionTexts([
      { '@type': 'HowToStep', text: '' },
      { '@type': 'HowToStep', text: '   ' },
      { '@type': 'HowToStep', text: 'Do thing.' },
    ]);
    expect(out).toEqual(['Do thing.']);
  });

  it('handles arrays of plain strings', () => {
    const out = extractInstructionTexts(['Do A.', 'Do B.']);
    expect(out).toEqual(['Do A.', 'Do B.']);
  });
});
