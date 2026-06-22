import { describe, expect, it } from 'vitest';

import { getColumnLabel } from './DataTable.toolbar';

describe('getColumnLabel', () => {
  it('returns the string header verbatim when present', () => {
    expect(getColumnLabel('description', 'Description')).toBe('Description');
    expect(getColumnLabel('amount', 'Amount')).toBe('Amount');
  });

  it('converts camelCase id to Title Case when header is a function', () => {
    expect(getColumnLabel('createdAt', () => null)).toBe('Created At');
    expect(getColumnLabel('lastEditedBy', () => null)).toBe('Last Edited By');
  });

  it('converts snake_case id to Title Case when header is undefined', () => {
    expect(getColumnLabel('last_edited_time', undefined)).toBe('Last Edited Time');
    expect(getColumnLabel('created_at', undefined)).toBe('Created At');
  });

  it('capitalizes simple lowercase ids', () => {
    expect(getColumnLabel('actions', undefined)).toBe('Actions');
    expect(getColumnLabel('date', undefined)).toBe('Date');
  });

  it('handles mixed snake_and_camelCase', () => {
    expect(getColumnLabel('item_createdAt', undefined)).toBe('Item Created At');
  });
});
