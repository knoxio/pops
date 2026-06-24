import { describe, expect, expectTypeOf, it } from 'vitest';

import { CerebrumErrorSchema } from '../errors.js';
import { EngramSchema } from '../schemas/engram.js';
import { NudgeSchema } from '../schemas/nudge.js';
import { ScopeSchema } from '../schemas/scope.js';

import type { z } from 'zod';

import type { CerebrumError } from '../errors.js';
import type { Engram } from '../types/engram.js';
import type { Nudge } from '../types/nudge.js';
import type { Scope } from '../types/scope.js';

describe('@pops/cerebrum round-trip', () => {
  it('Engram ↔ EngramSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof EngramSchema>>().toEqualTypeOf<Engram>();
  });

  it('Nudge ↔ NudgeSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof NudgeSchema>>().toEqualTypeOf<Nudge>();
  });

  it('Scope ↔ ScopeSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof ScopeSchema>>().toEqualTypeOf<Scope>();
  });

  it('CerebrumError ↔ CerebrumErrorSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof CerebrumErrorSchema>>().toEqualTypeOf<CerebrumError>();
  });

  it('EngramSchema accepts a well-formed payload', () => {
    const payload: Engram = {
      id: 'eng_1',
      content: 'Remember to refactor the dispatcher.',
      parentId: 'eng_0',
      tagIds: ['tag_focus', 'tag_dev'],
      scopeId: 'scope_work',
      createdAt: '2026-06-10T08:00:00.000Z',
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(EngramSchema.parse(payload)).toEqual(payload);
  });

  it('EngramSchema accepts null parentId, null scopeId, and empty tagIds', () => {
    const payload: Engram = {
      id: 'eng_2',
      content: 'orphan',
      parentId: null,
      tagIds: [],
      scopeId: null,
      createdAt: '2026-06-10T08:00:00.000Z',
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(EngramSchema.parse(payload)).toEqual(payload);
  });

  it('EngramSchema rejects a non-ISO-8601 lastEditedTime', () => {
    const bad = {
      id: 'eng_1',
      content: 'x',
      parentId: null,
      tagIds: [],
      scopeId: null,
      createdAt: '2026-06-10T08:00:00.000Z',
      lastEditedTime: '12 June 2026',
    };

    expect(() => EngramSchema.parse(bad)).toThrow();
  });

  it('EngramSchema rejects a non-string tagId', () => {
    const bad = {
      id: 'eng_1',
      content: 'x',
      parentId: null,
      tagIds: ['tag_focus', 42],
      scopeId: null,
      createdAt: '2026-06-10T08:00:00.000Z',
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => EngramSchema.parse(bad)).toThrow();
  });

  it('EngramSchema rejects a missing createdAt', () => {
    const bad = {
      id: 'eng_1',
      content: 'x',
      parentId: null,
      tagIds: [],
      scopeId: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => EngramSchema.parse(bad)).toThrow();
  });

  it('NudgeSchema accepts a well-formed pending payload', () => {
    const payload: Nudge = {
      id: 'nudge_1',
      message: 'Review your stale engrams from last quarter.',
      status: 'pending',
      scheduledFor: '2026-06-13T09:00:00.000Z',
      dispatchedAt: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(NudgeSchema.parse(payload)).toEqual(payload);
  });

  it('NudgeSchema accepts a sent payload with dispatchedAt set', () => {
    const payload: Nudge = {
      id: 'nudge_2',
      message: 'Consolidation candidates ready.',
      status: 'sent',
      scheduledFor: '2026-06-12T09:00:00.000Z',
      dispatchedAt: '2026-06-12T09:00:03.000Z',
      lastEditedTime: '2026-06-12T09:00:03.000Z',
    };

    expect(NudgeSchema.parse(payload)).toEqual(payload);
  });

  it('NudgeSchema rejects an unknown status', () => {
    const bad = {
      id: 'nudge_1',
      message: 'x',
      status: 'acted',
      scheduledFor: '2026-06-13T09:00:00.000Z',
      dispatchedAt: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => NudgeSchema.parse(bad)).toThrow();
  });

  it('NudgeSchema rejects a non-ISO-8601 scheduledFor', () => {
    const bad = {
      id: 'nudge_1',
      message: 'x',
      status: 'pending',
      scheduledFor: 'tomorrow',
      dispatchedAt: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => NudgeSchema.parse(bad)).toThrow();
  });

  it('NudgeSchema rejects a missing message', () => {
    const bad = {
      id: 'nudge_1',
      status: 'pending',
      scheduledFor: '2026-06-13T09:00:00.000Z',
      dispatchedAt: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => NudgeSchema.parse(bad)).toThrow();
  });

  it('ScopeSchema accepts a well-formed payload', () => {
    const payload: Scope = {
      id: 'scope_work',
      name: 'Work',
      parentId: null,
      description: 'Work-related engrams',
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(ScopeSchema.parse(payload)).toEqual(payload);
  });

  it('ScopeSchema accepts a child scope with null description', () => {
    const payload: Scope = {
      id: 'scope_work_karbon',
      name: 'Karbon',
      parentId: 'scope_work',
      description: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(ScopeSchema.parse(payload)).toEqual(payload);
  });

  it('ScopeSchema rejects a non-string name', () => {
    const bad = {
      id: 'scope_work',
      name: 42,
      parentId: null,
      description: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => ScopeSchema.parse(bad)).toThrow();
  });

  it('ScopeSchema rejects a non-ISO-8601 lastEditedTime', () => {
    const bad = {
      id: 'scope_work',
      name: 'Work',
      parentId: null,
      description: null,
      lastEditedTime: 'yesterday',
    };

    expect(() => ScopeSchema.parse(bad)).toThrow();
  });

  it('CerebrumErrorSchema accepts ContractStatus envelope', () => {
    expect(CerebrumErrorSchema.parse({ kind: 'unavailable' })).toEqual({ kind: 'unavailable' });
  });

  it('CerebrumErrorSchema accepts an unknown-engram domain error', () => {
    const err: CerebrumError = { kind: 'unknown-engram', engramId: 'eng_1' };
    expect(CerebrumErrorSchema.parse(err)).toEqual(err);
  });

  it('CerebrumErrorSchema accepts an engram-archived domain error', () => {
    const err: CerebrumError = { kind: 'engram-archived', engramId: 'eng_1' };
    expect(CerebrumErrorSchema.parse(err)).toEqual(err);
  });

  it('CerebrumErrorSchema rejects an unknown kind', () => {
    expect(() => CerebrumErrorSchema.parse({ kind: 'mystery' })).toThrow();
  });
});
