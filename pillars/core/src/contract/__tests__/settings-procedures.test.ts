import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  SettingsDeleteInputSchema,
  SettingsDeleteOutputSchema,
  SettingsEnsureInputSchema,
  SettingsEnsureOutputSchema,
  SettingsGetInputSchema,
  SettingsGetManyInputSchema,
  SettingsGetManyOutputSchema,
  SettingsGetOutputSchema,
  SettingsSetInputSchema,
  SettingsSetManyInputSchema,
  SettingsSetManyOutputSchema,
  SettingsSetOutputSchema,
} from '../schemas/settings-procedures.js';

import type { z } from 'zod';

import type {
  SettingsDeleteInput,
  SettingsDeleteOutput,
  SettingsEnsureInput,
  SettingsEnsureOutput,
  SettingsGetInput,
  SettingsGetManyInput,
  SettingsGetManyOutput,
  SettingsGetOutput,
  SettingsSetInput,
  SettingsSetManyInput,
  SettingsSetManyOutput,
  SettingsSetOutput,
} from '../types/settings-procedures.js';

const KNOWN_KEY = 'plex_token';
const OTHER_KEY = 'plex_username';
const UNKNOWN_KEY = 'totally.made.up';

describe('@pops/core-contract core.settings.* procedure schemas — round trip', () => {
  it('SettingsGetInput ↔ schema', () => {
    expectTypeOf<z.infer<typeof SettingsGetInputSchema>>().toEqualTypeOf<SettingsGetInput>();
  });

  it('SettingsGetOutput ↔ schema', () => {
    expectTypeOf<z.infer<typeof SettingsGetOutputSchema>>().toEqualTypeOf<SettingsGetOutput>();
  });

  it('SettingsSetInput ↔ schema', () => {
    expectTypeOf<z.infer<typeof SettingsSetInputSchema>>().toEqualTypeOf<SettingsSetInput>();
  });

  it('SettingsSetOutput ↔ schema', () => {
    expectTypeOf<z.infer<typeof SettingsSetOutputSchema>>().toEqualTypeOf<SettingsSetOutput>();
  });

  it('SettingsEnsureInput ↔ schema', () => {
    expectTypeOf<z.infer<typeof SettingsEnsureInputSchema>>().toEqualTypeOf<SettingsEnsureInput>();
  });

  it('SettingsEnsureOutput ↔ schema', () => {
    expectTypeOf<
      z.infer<typeof SettingsEnsureOutputSchema>
    >().toEqualTypeOf<SettingsEnsureOutput>();
  });

  it('SettingsDeleteInput ↔ schema', () => {
    expectTypeOf<z.infer<typeof SettingsDeleteInputSchema>>().toEqualTypeOf<SettingsDeleteInput>();
  });

  it('SettingsDeleteOutput ↔ schema', () => {
    expectTypeOf<
      z.infer<typeof SettingsDeleteOutputSchema>
    >().toEqualTypeOf<SettingsDeleteOutput>();
  });

  it('SettingsGetManyInput ↔ schema', () => {
    expectTypeOf<
      z.infer<typeof SettingsGetManyInputSchema>
    >().toEqualTypeOf<SettingsGetManyInput>();
  });

  it('SettingsGetManyOutput ↔ schema', () => {
    expectTypeOf<
      z.infer<typeof SettingsGetManyOutputSchema>
    >().toEqualTypeOf<SettingsGetManyOutput>();
  });

  it('SettingsSetManyInput ↔ schema', () => {
    expectTypeOf<
      z.infer<typeof SettingsSetManyInputSchema>
    >().toEqualTypeOf<SettingsSetManyInput>();
  });

  it('SettingsSetManyOutput ↔ schema', () => {
    expectTypeOf<
      z.infer<typeof SettingsSetManyOutputSchema>
    >().toEqualTypeOf<SettingsSetManyOutput>();
  });
});

describe('SettingsGetInputSchema', () => {
  it('accepts a well-formed input with a known key', () => {
    expect(SettingsGetInputSchema.parse({ key: KNOWN_KEY })).toEqual({ key: KNOWN_KEY });
  });

  it('rejects an unknown key', () => {
    expect(() => SettingsGetInputSchema.parse({ key: UNKNOWN_KEY })).toThrow();
  });

  it('rejects a missing key', () => {
    expect(() => SettingsGetInputSchema.parse({})).toThrow();
  });

  it('rejects a non-string key', () => {
    expect(() => SettingsGetInputSchema.parse({ key: 42 })).toThrow();
  });
});

describe('SettingsGetOutputSchema', () => {
  it('accepts a hit (Setting row)', () => {
    const payload: SettingsGetOutput = {
      data: { key: KNOWN_KEY, value: 'token-value' },
    };
    expect(SettingsGetOutputSchema.parse(payload)).toEqual(payload);
  });

  it('accepts a miss (null)', () => {
    const payload: SettingsGetOutput = { data: null };
    expect(SettingsGetOutputSchema.parse(payload)).toEqual(payload);
  });

  it('rejects a missing data field', () => {
    expect(() => SettingsGetOutputSchema.parse({})).toThrow();
  });

  it('rejects a Setting with a non-string value', () => {
    expect(() => SettingsGetOutputSchema.parse({ data: { key: KNOWN_KEY, value: 42 } })).toThrow();
  });
});

describe('SettingsSetInputSchema', () => {
  it('accepts a well-formed input', () => {
    const payload: SettingsSetInput = { key: KNOWN_KEY, value: 'new-value' };
    expect(SettingsSetInputSchema.parse(payload)).toEqual(payload);
  });

  it('rejects a missing value', () => {
    expect(() => SettingsSetInputSchema.parse({ key: KNOWN_KEY })).toThrow();
  });

  it('rejects an unknown key', () => {
    expect(() => SettingsSetInputSchema.parse({ key: UNKNOWN_KEY, value: 'v' })).toThrow();
  });

  it('rejects a non-string value', () => {
    expect(() => SettingsSetInputSchema.parse({ key: KNOWN_KEY, value: 42 })).toThrow();
  });
});

describe('SettingsSetOutputSchema', () => {
  it('accepts a well-formed response', () => {
    const payload: SettingsSetOutput = {
      data: { key: KNOWN_KEY, value: 'v' },
      message: 'Setting saved',
    };
    expect(SettingsSetOutputSchema.parse(payload)).toEqual(payload);
  });

  it('rejects a missing message', () => {
    expect(() => SettingsSetOutputSchema.parse({ data: { key: KNOWN_KEY, value: 'v' } })).toThrow();
  });

  it('rejects a null data', () => {
    expect(() => SettingsSetOutputSchema.parse({ data: null, message: 'ok' })).toThrow();
  });
});

describe('SettingsEnsureInputSchema', () => {
  it('accepts a well-formed input', () => {
    const payload: SettingsEnsureInput = { key: KNOWN_KEY, value: 'seed' };
    expect(SettingsEnsureInputSchema.parse(payload)).toEqual(payload);
  });

  it('rejects a missing value', () => {
    expect(() => SettingsEnsureInputSchema.parse({ key: KNOWN_KEY })).toThrow();
  });

  it('rejects an unknown key', () => {
    expect(() => SettingsEnsureInputSchema.parse({ key: UNKNOWN_KEY, value: 'v' })).toThrow();
  });
});

describe('SettingsEnsureOutputSchema', () => {
  it('accepts a well-formed upsert-return', () => {
    const payload: SettingsEnsureOutput = { data: { key: KNOWN_KEY, value: 'seed' } };
    expect(SettingsEnsureOutputSchema.parse(payload)).toEqual(payload);
  });

  it('rejects a null data — ensure must always return the persisted row', () => {
    expect(() => SettingsEnsureOutputSchema.parse({ data: null })).toThrow();
  });
});

describe('SettingsDeleteInputSchema', () => {
  it('accepts a well-formed input', () => {
    const payload: SettingsDeleteInput = { key: KNOWN_KEY };
    expect(SettingsDeleteInputSchema.parse(payload)).toEqual(payload);
  });

  it('rejects an unknown key', () => {
    expect(() => SettingsDeleteInputSchema.parse({ key: UNKNOWN_KEY })).toThrow();
  });
});

describe('SettingsDeleteOutputSchema', () => {
  it('accepts a well-formed response', () => {
    const payload: SettingsDeleteOutput = { message: 'Setting deleted' };
    expect(SettingsDeleteOutputSchema.parse(payload)).toEqual(payload);
  });

  it('rejects a missing message', () => {
    expect(() => SettingsDeleteOutputSchema.parse({})).toThrow();
  });

  it('rejects a non-string message', () => {
    expect(() => SettingsDeleteOutputSchema.parse({ message: 42 })).toThrow();
  });
});

describe('SettingsGetManyInputSchema', () => {
  it('accepts a non-empty key list', () => {
    const payload: SettingsGetManyInput = { keys: [KNOWN_KEY, OTHER_KEY] };
    expect(SettingsGetManyInputSchema.parse(payload)).toEqual(payload);
  });

  it('accepts an empty key list (matches getBulkSettings semantics)', () => {
    const payload: SettingsGetManyInput = { keys: [] };
    expect(SettingsGetManyInputSchema.parse(payload)).toEqual(payload);
  });

  it('accepts free-form string keys — getMany is not enum-constrained', () => {
    const payload: SettingsGetManyInput = { keys: [UNKNOWN_KEY] };
    expect(SettingsGetManyInputSchema.parse(payload)).toEqual(payload);
  });

  it('rejects a missing keys field', () => {
    expect(() => SettingsGetManyInputSchema.parse({})).toThrow();
  });

  it('rejects a non-array keys', () => {
    expect(() => SettingsGetManyInputSchema.parse({ keys: KNOWN_KEY })).toThrow();
  });

  it('rejects a non-string element', () => {
    expect(() => SettingsGetManyInputSchema.parse({ keys: [KNOWN_KEY, 42] })).toThrow();
  });
});

describe('SettingsGetManyOutputSchema', () => {
  it('accepts a populated map', () => {
    const payload: SettingsGetManyOutput = {
      settings: { [KNOWN_KEY]: 'a', [OTHER_KEY]: 'b' },
    };
    expect(SettingsGetManyOutputSchema.parse(payload)).toEqual(payload);
  });

  it('accepts the empty map (missing keys are omitted, not null-valued)', () => {
    const payload: SettingsGetManyOutput = { settings: {} };
    expect(SettingsGetManyOutputSchema.parse(payload)).toEqual(payload);
  });

  it('rejects a null-valued entry — the contract omits missing keys', () => {
    expect(() => SettingsGetManyOutputSchema.parse({ settings: { [KNOWN_KEY]: null } })).toThrow();
  });

  it('rejects a non-string value', () => {
    expect(() => SettingsGetManyOutputSchema.parse({ settings: { [KNOWN_KEY]: 42 } })).toThrow();
  });

  it('rejects a missing settings field', () => {
    expect(() => SettingsGetManyOutputSchema.parse({})).toThrow();
  });
});

describe('SettingsSetManyInputSchema', () => {
  it('accepts a non-empty entries list', () => {
    const payload: SettingsSetManyInput = {
      entries: [
        { key: KNOWN_KEY, value: 'a' },
        { key: OTHER_KEY, value: 'b' },
      ],
    };
    expect(SettingsSetManyInputSchema.parse(payload)).toEqual(payload);
  });

  it('accepts an empty entries list', () => {
    const payload: SettingsSetManyInput = { entries: [] };
    expect(SettingsSetManyInputSchema.parse(payload)).toEqual(payload);
  });

  it('rejects a missing entries field', () => {
    expect(() => SettingsSetManyInputSchema.parse({})).toThrow();
  });

  it('rejects an entry missing its value', () => {
    expect(() => SettingsSetManyInputSchema.parse({ entries: [{ key: KNOWN_KEY }] })).toThrow();
  });

  it('rejects a non-string value', () => {
    expect(() =>
      SettingsSetManyInputSchema.parse({ entries: [{ key: KNOWN_KEY, value: 42 }] })
    ).toThrow();
  });
});

describe('SettingsSetManyOutputSchema', () => {
  it('accepts a populated map', () => {
    const payload: SettingsSetManyOutput = {
      settings: { [KNOWN_KEY]: 'a', [OTHER_KEY]: 'b' },
    };
    expect(SettingsSetManyOutputSchema.parse(payload)).toEqual(payload);
  });

  it('accepts the empty map', () => {
    const payload: SettingsSetManyOutput = { settings: {} };
    expect(SettingsSetManyOutputSchema.parse(payload)).toEqual(payload);
  });

  it('rejects a missing settings field', () => {
    expect(() => SettingsSetManyOutputSchema.parse({})).toThrow();
  });

  it('rejects a non-string value', () => {
    expect(() => SettingsSetManyOutputSchema.parse({ settings: { [KNOWN_KEY]: 42 } })).toThrow();
  });
});
