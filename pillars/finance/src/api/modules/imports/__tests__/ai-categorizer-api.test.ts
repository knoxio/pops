/**
 * Unit tests for `buildEntryFromText` — the model-response parser. Guards the
 * regression where Haiku returned a valid JSON object followed by an
 * explanatory sentence and naive whole-string `JSON.parse` threw
 * "Unexpected non-whitespace character after JSON at position N", which
 * bubbled up and hard-*failed* the transaction. The parser now extracts the
 * first balanced JSON object (tolerating surrounding prose) and, when nothing
 * parseable is present, throws an `AiCategorizationError('PARSE_ERROR')` so the
 * caller degrades the row to *uncertain* instead of failing it.
 */
import { describe, expect, it } from 'vitest';

import { buildEntryFromText } from '../ai-categorizer-api.js';
import { AiCategorizationError } from '../ai-categorizer-error.js';

describe('buildEntryFromText — parsing robustness', () => {
  it('parses a clean JSON object', () => {
    const entry = buildEntryFromText('{"entityName":"Woolworths","tags":["Groceries"]}');
    expect(entry.entityName).toBe('Woolworths');
    expect(entry.tags).toEqual(['Groceries']);
  });

  it('strips ```json code fences', () => {
    const entry = buildEntryFromText('```json\n{"entityName":"Aldi","tags":["Groceries"]}\n```');
    expect(entry.entityName).toBe('Aldi');
  });

  it('tolerates prose appended after the JSON object (the reported bug)', () => {
    const entry = buildEntryFromText(
      '{"entityName":"Ozturk Jr","tags":["Dining"]}\n\nThis appears to be a restaurant in Darlington.'
    );
    expect(entry.entityName).toBe('Ozturk Jr');
    expect(entry.tags).toEqual(['Dining']);
  });

  it('tolerates pretty-printed JSON followed by an explanation (the position-49 shape)', () => {
    const reply = [
      '{',
      '  "entityName": "Metro Petroleum",',
      '  "tags": ["Transport"]',
      '}',
      'Hope this helps!',
    ].join('\n');
    const entry = buildEntryFromText(reply);
    expect(entry.entityName).toBe('Metro Petroleum');
    expect(entry.tags).toEqual(['Transport']);
  });

  it('tolerates prose before the JSON object', () => {
    const entry = buildEntryFromText(
      'Here is the result: {"entityName":"Coles","tags":["Groceries"]}'
    );
    expect(entry.entityName).toBe('Coles');
  });

  it('does not stop the scan on braces inside string values', () => {
    const entry = buildEntryFromText(
      '{"entityName":"Curly {Braces} Cafe","tags":["Dining"]} trailing'
    );
    expect(entry.entityName).toBe('Curly {Braces} Cafe');
    expect(entry.tags).toEqual(['Dining']);
  });

  it('throws PARSE_ERROR when the reply holds no JSON object', () => {
    try {
      buildEntryFromText('I could not identify this merchant.');
      throw new Error('expected buildEntryFromText to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AiCategorizationError);
      expect((err as AiCategorizationError).code).toBe('PARSE_ERROR');
    }
  });

  it('throws PARSE_ERROR when the object is malformed', () => {
    try {
      buildEntryFromText('{"entityName": "X", tags: [oops]}');
      throw new Error('expected buildEntryFromText to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AiCategorizationError);
      expect((err as AiCategorizationError).code).toBe('PARSE_ERROR');
    }
  });
});
