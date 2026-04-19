import { describe, expect, it } from 'vitest';

import { ValidationError } from '../../../shared/errors.js';
import { normaliseBody } from './normalizer.js';

describe('normaliseBody', () => {
  it('throws ValidationError for empty string', () => {
    expect(() => normaliseBody('')).toThrow(ValidationError);
  });

  it('throws ValidationError for whitespace-only string', () => {
    expect(() => normaliseBody('   \n\t  ')).toThrow(ValidationError);
  });

  it('normalises CRLF and CR line endings to LF', () => {
    expect(normaliseBody('hello\r\nworld')).toBe('hello\nworld');
    expect(normaliseBody('hello\rworld')).toBe('hello\nworld');
  });

  it('collapses 3+ consecutive blank lines to 2', () => {
    const input = 'a\n\n\n\nb';
    expect(normaliseBody(input)).toBe('a\n\nb');
  });

  it('trims trailing whitespace from each line', () => {
    expect(normaliseBody('hello   \nworld  ')).toBe('hello\nworld');
  });

  it('trims leading/trailing whitespace from the whole body', () => {
    expect(normaliseBody('  hello  ')).toBe('hello');
  });

  it('wraps valid JSON object in fenced code block', () => {
    const json = '{"key": "value"}';
    const result = normaliseBody(json);
    expect(result).toMatch(/^```json\n/);
    expect(result).toMatch(/\n```$/);
  });

  it('wraps valid JSON array in fenced code block', () => {
    const json = '[1, 2, 3]';
    const result = normaliseBody(json);
    expect(result).toMatch(/^```json\n/);
  });

  it('leaves plain text unchanged (beyond basic normalisation)', () => {
    expect(normaliseBody('hello world')).toBe('hello world');
  });

  it('leaves markdown unchanged', () => {
    const md = '# Title\n\nSome content.';
    expect(normaliseBody(md)).toBe(md);
  });

  it('leaves invalid JSON as plain text', () => {
    const text = '{not: valid json}';
    expect(normaliseBody(text)).toBe(text);
  });
});
