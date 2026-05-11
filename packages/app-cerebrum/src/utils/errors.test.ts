import { describe, expect, it } from 'vitest';

import { extractMessage } from './errors';

describe('extractMessage', () => {
  it('returns the message field when the error is an Error instance', () => {
    expect(extractMessage(new Error('boom'), 'fallback')).toBe('boom');
  });

  it('returns the message field on plain objects', () => {
    expect(extractMessage({ message: 'oops' }, 'fallback')).toBe('oops');
  });

  it('returns the caller-provided fallback for null', () => {
    expect(extractMessage(null, 'Erro desconhecido')).toBe('Erro desconhecido');
  });

  it('returns the caller-provided fallback for undefined', () => {
    expect(extractMessage(undefined, 'translated')).toBe('translated');
  });

  it('returns the caller-provided fallback when message is non-string', () => {
    expect(extractMessage({ message: 42 }, 'translated')).toBe('translated');
  });

  it('returns the caller-provided fallback when message is empty', () => {
    // Empty string is treated as "no useful message" so the localized
    // fallback wins; previously `''` would be surfaced verbatim.
    expect(extractMessage({ message: '' }, 'translated')).toBe('translated');
  });

  it('returns the caller-provided fallback for primitive errors', () => {
    expect(extractMessage('string error', 'translated')).toBe('translated');
    expect(extractMessage(123, 'translated')).toBe('translated');
  });
});
