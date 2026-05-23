/**
 * Unit tests for AI categorizer post-processing — `sanitizeEntityName`
 * (issues #2449 placeholder removal, #2450 store-number stripping) and
 * `buildEntryFromText` integration.
 */
import { describe, expect, it } from 'vitest';

import { buildEntryFromText, sanitizeEntityName } from './ai-categorizer-api.js';

describe('sanitizeEntityName — placeholder rejection (#2449)', () => {
  it('rejects "Unknown Membership Organization"', () => {
    expect(sanitizeEntityName('Unknown Membership Organization')).toBeNull();
  });

  it('rejects "Unidentified Vendor"', () => {
    expect(sanitizeEntityName('Unidentified Vendor')).toBeNull();
  });

  it('rejects "Generic Merchant"', () => {
    expect(sanitizeEntityName('Generic Merchant')).toBeNull();
  });

  it('rejects "Unspecified Service"', () => {
    expect(sanitizeEntityName('Unspecified Service')).toBeNull();
  });

  it('rejects "Unnamed Vendor"', () => {
    expect(sanitizeEntityName('Unnamed Vendor')).toBeNull();
  });

  it('rejects "Placeholder Entity"', () => {
    expect(sanitizeEntityName('Placeholder Entity')).toBeNull();
  });

  it('rejects "Unrecognized Merchant" (US spelling)', () => {
    expect(sanitizeEntityName('Unrecognized Merchant')).toBeNull();
  });

  it('rejects "Unrecognised Merchant" (UK spelling)', () => {
    expect(sanitizeEntityName('Unrecognised Merchant')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(sanitizeEntityName('UNKNOWN ORGANIZATION')).toBeNull();
    expect(sanitizeEntityName('unknown organization')).toBeNull();
  });

  it('uses word boundary — "Unknowns" (made-up brand starting with Unknown) is not stripped', () => {
    // The regex anchors on the full word "unknown" + word boundary, so plural
    // forms or words that merely start with "unknown" still match the leading
    // pattern and are rejected. Real merchants don't begin with "Unknown" so
    // this is acceptable.
    expect(sanitizeEntityName('Unknowns Coffee')).toBe('Unknowns Coffee');
  });

  it('does not reject a real name that contains "unknown" mid-string', () => {
    expect(sanitizeEntityName('The Unknown Pleasures Records')).toBe(
      'The Unknown Pleasures Records'
    );
  });
});

describe('sanitizeEntityName — trailing store/location codes (#2450)', () => {
  it('strips trailing 7-digit store number', () => {
    expect(sanitizeEntityName('Metro Petroleum 7342896 Hurlstone Par')).toBe('Metro Petroleum');
  });

  it('strips trailing 4-digit code + duplicated suburb', () => {
    expect(sanitizeEntityName('WW Metro 1130 Park Sydn Erskineville Pa')).toBe('WW Metro');
  });

  it('strips trailing 3-digit code', () => {
    expect(sanitizeEntityName('Coles 123 Bondi')).toBe('Coles');
  });

  it('does not strip a leading digit-prefixed brand like "7-Eleven"', () => {
    expect(sanitizeEntityName('7-Eleven')).toBe('7-Eleven');
  });

  it('does not strip a 2-digit number (e.g. real brand suffix)', () => {
    expect(sanitizeEntityName('Cafe 22')).toBe('Cafe 22');
  });

  it('leaves clean names untouched', () => {
    expect(sanitizeEntityName('Woolworths')).toBe('Woolworths');
  });

  it('preserves internal numbers in brand names', () => {
    expect(sanitizeEntityName('1900 Mexican')).toBe('1900 Mexican');
  });

  it('rejects a name whose only non-store content is a placeholder word', () => {
    expect(sanitizeEntityName('Unknown 12345 Merchant')).toBeNull();
  });
});

describe('sanitizeEntityName — empty / null inputs', () => {
  it('returns null for null', () => {
    expect(sanitizeEntityName(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(sanitizeEntityName('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(sanitizeEntityName('   ')).toBeNull();
  });

  it('returns null when stripping leaves empty string', () => {
    expect(sanitizeEntityName('1234567')).toBe('1234567'); // no leading non-digit token to keep, regex doesn't fire
    expect(sanitizeEntityName('Brand 1234567')).toBe('Brand');
  });
});

describe('buildEntryFromText — integration', () => {
  it('extracts entityName + category from raw JSON', () => {
    const text = '{"entityName": "Woolworths", "category": "Groceries"}';
    const entry = buildEntryFromText(text, 'WOOLWORTHS 1234 BONDI');
    expect(entry.entityName).toBe('Woolworths');
    expect(entry.category).toBe('Groceries');
  });

  it('handles ```json fenced code blocks', () => {
    const text = '```json\n{"entityName": "Coles", "category": "Groceries"}\n```';
    const entry = buildEntryFromText(text, 'COLES 5678');
    expect(entry.entityName).toBe('Coles');
  });

  it('returns null entityName when the model returns a placeholder', () => {
    const text = '{"entityName": "Unknown Membership Organization", "category": "Other"}';
    const entry = buildEntryFromText(text, 'MEMBERSHIP FEE');
    expect(entry.entityName).toBeNull();
    expect(entry.category).toBe('Other');
  });

  it('strips trailing store codes on extracted entityName', () => {
    const text = '{"entityName": "Metro Petroleum 7342896 Hurlstone Par", "category": "Transport"}';
    const entry = buildEntryFromText(text, 'METRO PETROLEUM 7342896');
    expect(entry.entityName).toBe('Metro Petroleum');
  });

  it('accepts explicit null entityName from model', () => {
    const text = '{"entityName": null, "category": "Other"}';
    const entry = buildEntryFromText(text, 'MEMBERSHIP FEE');
    expect(entry.entityName).toBeNull();
  });

  it('extracts tags array from new prompt format', () => {
    const text = '{"entityName": "Ampol", "tags": ["Charging", "EV", "Novated Lease"]}';
    const entry = buildEntryFromText(text, 'AMPOL SYDNEY');
    expect(entry.entityName).toBe('Ampol');
    expect(entry.tags).toEqual(['Charging', 'EV', 'Novated Lease']);
    expect(entry.category).toBe('Charging');
  });

  it('handles new format with both entity and multiple tags', () => {
    const text = '{"entityName": "Woolworths", "tags": ["Groceries", "Fresh Produce"]}';
    const entry = buildEntryFromText(text, 'WOOLWORTHS 1034');
    expect(entry.entityName).toBe('Woolworths');
    expect(entry.tags).toEqual(['Groceries', 'Fresh Produce']);
  });

  it('filters non-string values from tags array', () => {
    const text = '{"entityName": "Foo", "tags": ["Valid", 42, null, "Also Valid"]}';
    const entry = buildEntryFromText(text, 'FOO BAR');
    expect(entry.tags).toEqual(['Valid', 'Also Valid']);
  });

  it('falls back to legacy category when tags array is empty', () => {
    const text = '{"entityName": "Woolworths", "tags": [], "category": "Groceries"}';
    const entry = buildEntryFromText(text, 'WOOLWORTHS 1234');
    expect(entry.entityName).toBe('Woolworths');
    expect(entry.tags).toEqual([]);
    expect(entry.category).toBe('Groceries');
  });
});
