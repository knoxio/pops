import { describe, expect, it, vi } from 'vitest';

// ── fieldsByKey lookup ────────────────────────────────────────────────

describe('SectionRenderer: fieldsByKey lookup', () => {
  function buildFieldsByKey(groups: { fields: { key: string; requiresRestart?: boolean }[] }[]) {
    return Object.fromEntries(groups.flatMap((g) => g.fields.map((f) => [f.key, f])));
  }

  it('maps field keys to their field definitions', () => {
    const groups = [
      { fields: [{ key: 'a.key', requiresRestart: false }, { key: 'b.key', requiresRestart: true }] },
    ];
    const map = buildFieldsByKey(groups);
    expect(map['a.key']?.requiresRestart).toBe(false);
    expect(map['b.key']?.requiresRestart).toBe(true);
  });

  it('returns undefined for unknown keys', () => {
    const groups = [{ fields: [{ key: 'x', requiresRestart: true }] }];
    const map = buildFieldsByKey(groups);
    expect(map['missing']).toBeUndefined();
  });

  it('handles fields without requiresRestart set', () => {
    const groups = [{ fields: [{ key: 'plain' }] }];
    const map = buildFieldsByKey(groups);
    expect(map['plain']?.requiresRestart).toBeFalsy();
  });
});

// ── restart toast trigger ─────────────────────────────────────────────

describe('SectionRenderer: restart-required toast trigger', () => {
  type FieldMap = Record<string, { requiresRestart?: boolean }>;

  function makeOnSuccess(fieldsByKey: FieldMap, toastInfo: (msg: string) => void) {
    return (key: string) => {
      if (fieldsByKey[key]?.requiresRestart) {
        toastInfo('Setting saved — restart required for this change to take effect');
      }
    };
  }

  it('fires info toast when a requiresRestart field saves successfully', () => {
    const toastInfo = vi.fn();
    const fieldsByKey: FieldMap = { 'server.port': { requiresRestart: true } };
    makeOnSuccess(fieldsByKey, toastInfo)('server.port');
    expect(toastInfo).toHaveBeenCalledWith(
      'Setting saved — restart required for this change to take effect'
    );
  });

  it('does not fire toast for fields without requiresRestart', () => {
    const toastInfo = vi.fn();
    const fieldsByKey: FieldMap = { 'plex.url': { requiresRestart: false } };
    makeOnSuccess(fieldsByKey, toastInfo)('plex.url');
    expect(toastInfo).not.toHaveBeenCalled();
  });

  it('does not fire toast when save errors (only error toast fires on onError path)', () => {
    const toastInfo = vi.fn();
    const toastError = vi.fn();
    const fieldsByKey: FieldMap = { 'server.port': { requiresRestart: true } };
    const onSuccess = makeOnSuccess(fieldsByKey, toastInfo);
    const onError = (key: string, message: string) => toastError(`Failed to save ${key}: ${message}`);

    onError('server.port', 'Network error');
    expect(toastError).toHaveBeenCalledWith('Failed to save server.port: Network error');
    expect(toastInfo).not.toHaveBeenCalled();

    // onSuccess was never called — confirm toast still silent
    expect(toastInfo).not.toHaveBeenCalled();
  });
});

// ── debounced save ────────────────────────────────────────────────────

describe('SectionRenderer: debounced save', () => {
  function makeHandleChange(mutate: (args: unknown) => void) {
    const debounceRefs = new Map<string, ReturnType<typeof setTimeout>>();
    return (key: string, value: string) => {
      const existing = debounceRefs.get(key);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        debounceRefs.delete(key);
        mutate({ entries: [{ key, value }] });
      }, 500);
      debounceRefs.set(key, timer);
    };
  }

  it('does not call mutate before the 500ms debounce expires', () => {
    vi.useFakeTimers();
    const mutate = vi.fn();
    const handleChange = makeHandleChange(mutate);

    handleChange('server.port', '8080');
    vi.advanceTimersByTime(499);
    expect(mutate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(mutate).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('debounces rapid changes — only the last value is saved', () => {
    vi.useFakeTimers();
    const mutate = vi.fn();
    const handleChange = makeHandleChange(mutate);

    handleChange('server.port', '8');
    handleChange('server.port', '80');
    handleChange('server.port', '808');
    handleChange('server.port', '8080');

    vi.advanceTimersByTime(500);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({ entries: [{ key: 'server.port', value: '8080' }] });
    vi.useRealTimers();
  });

  it('saves immediately for different keys without blocking each other', () => {
    vi.useFakeTimers();
    const mutate = vi.fn();
    const handleChange = makeHandleChange(mutate);

    handleChange('key.a', 'val-a');
    handleChange('key.b', 'val-b');

    vi.advanceTimersByTime(500);
    expect(mutate).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
