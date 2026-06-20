import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  CreateInputSchema,
  DebriefResultSchema,
  DebriefSessionSchema,
  DebriefStatusSchema,
  DeleteByWatchHistoryIdInputSchema,
  DismissInputSchema,
  GetByMediaInputSchema,
  GetInputSchema,
  ListPendingInputSchema,
  LogWatchCompletionInputSchema,
  RecordInputSchema,
} from '../schemas/debrief.js';

import type { z } from 'zod';

import type {
  CreateInput,
  DebriefResult,
  DebriefSession,
  DebriefStatus,
  DeleteByWatchHistoryIdInput,
  DismissInput,
  GetByMediaInput,
  GetInput,
  ListPendingInput,
  LogWatchCompletionInput,
  RecordInput,
} from '../types/debrief.js';

describe('cerebrum.debrief contract — entity round-trip', () => {
  it('DebriefSession ↔ DebriefSessionSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof DebriefSessionSchema>>().toEqualTypeOf<DebriefSession>();
  });

  it('DebriefResult ↔ DebriefResultSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof DebriefResultSchema>>().toEqualTypeOf<DebriefResult>();
  });

  it('DebriefStatus ↔ DebriefStatusSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof DebriefStatusSchema>>().toEqualTypeOf<DebriefStatus>();
  });

  it('DebriefSessionSchema accepts a well-formed pending row', () => {
    const payload: DebriefSession = {
      id: 1,
      watchHistoryId: 42,
      mediaType: 'movie',
      mediaId: 123,
      status: 'pending',
      createdAt: '2026-06-15 02:55:00',
    };
    expect(DebriefSessionSchema.parse(payload)).toEqual(payload);
  });

  it('DebriefSessionSchema accepts null denormalised media columns (migration window)', () => {
    const payload: DebriefSession = {
      id: 7,
      watchHistoryId: 100,
      mediaType: null,
      mediaId: null,
      status: 'active',
      createdAt: '2026-06-15 02:55:00',
    };
    expect(DebriefSessionSchema.parse(payload)).toEqual(payload);
  });

  it('DebriefSessionSchema rejects an unknown status', () => {
    expect(() =>
      DebriefSessionSchema.parse({
        id: 1,
        watchHistoryId: 42,
        mediaType: 'movie',
        mediaId: 123,
        status: 'mystery',
        createdAt: '2026-06-15 02:55:00',
      })
    ).toThrow();
  });

  it('DebriefSessionSchema rejects an unknown mediaType', () => {
    expect(() =>
      DebriefSessionSchema.parse({
        id: 1,
        watchHistoryId: 42,
        mediaType: 'podcast',
        mediaId: 123,
        status: 'pending',
        createdAt: '2026-06-15 02:55:00',
      })
    ).toThrow();
  });

  it('DebriefResultSchema accepts a dismissed dimension (null comparisonId)', () => {
    const payload: DebriefResult = {
      id: 10,
      sessionId: 1,
      dimensionId: 3,
      comparisonId: null,
      createdAt: '2026-06-15 02:55:00',
    };
    expect(DebriefResultSchema.parse(payload)).toEqual(payload);
  });

  it('DebriefResultSchema accepts a recorded comparison', () => {
    const payload: DebriefResult = {
      id: 11,
      sessionId: 1,
      dimensionId: 3,
      comparisonId: 555,
      createdAt: '2026-06-15 02:55:00',
    };
    expect(DebriefResultSchema.parse(payload)).toEqual(payload);
  });

  it('DebriefResultSchema rejects a non-integer sessionId', () => {
    expect(() =>
      DebriefResultSchema.parse({
        id: 10,
        sessionId: '1',
        dimensionId: 3,
        comparisonId: null,
        createdAt: '2026-06-15 02:55:00',
      })
    ).toThrow();
  });

  it('DebriefStatusSchema accepts a well-formed row', () => {
    const payload: DebriefStatus = {
      id: 99,
      mediaType: 'movie',
      mediaId: 123,
      dimensionId: 3,
      debriefed: 0,
      dismissed: 0,
      createdAt: '2026-06-15 02:55:00',
      updatedAt: '2026-06-15 02:55:00',
    };
    expect(DebriefStatusSchema.parse(payload)).toEqual(payload);
  });

  it('DebriefStatusSchema rejects a missing updatedAt', () => {
    expect(() =>
      DebriefStatusSchema.parse({
        id: 99,
        mediaType: 'movie',
        mediaId: 123,
        dimensionId: 3,
        debriefed: 0,
        dismissed: 0,
        createdAt: '2026-06-15 02:55:00',
      })
    ).toThrow();
  });
});

describe('cerebrum.debrief contract — procedure inputs', () => {
  it('RecordInput ↔ RecordInputSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof RecordInputSchema>>().toEqualTypeOf<RecordInput>();
  });

  it('DismissInput ↔ DismissInputSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof DismissInputSchema>>().toEqualTypeOf<DismissInput>();
  });

  it('ListPendingInput ↔ ListPendingInputSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof ListPendingInputSchema>>().toEqualTypeOf<ListPendingInput>();
  });

  it('CreateInput ↔ CreateInputSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof CreateInputSchema>>().toEqualTypeOf<CreateInput>();
  });

  it('GetInput ↔ GetInputSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof GetInputSchema>>().toEqualTypeOf<GetInput>();
  });

  it('GetByMediaInput ↔ GetByMediaInputSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof GetByMediaInputSchema>>().toEqualTypeOf<GetByMediaInput>();
  });

  it('LogWatchCompletionInput ↔ LogWatchCompletionInputSchema agree structurally', () => {
    expectTypeOf<
      z.infer<typeof LogWatchCompletionInputSchema>
    >().toEqualTypeOf<LogWatchCompletionInput>();
  });

  it('DeleteByWatchHistoryIdInput ↔ DeleteByWatchHistoryIdInputSchema agree structurally', () => {
    expectTypeOf<
      z.infer<typeof DeleteByWatchHistoryIdInputSchema>
    >().toEqualTypeOf<DeleteByWatchHistoryIdInput>();
  });

  it('RecordInputSchema accepts a recorded comparison', () => {
    const payload: RecordInput = { sessionId: 1, dimensionId: 3, comparisonId: 555 };
    expect(RecordInputSchema.parse(payload)).toEqual(payload);
  });

  it('RecordInputSchema accepts a null comparisonId (skip)', () => {
    const payload: RecordInput = { sessionId: 1, dimensionId: 3, comparisonId: null };
    expect(RecordInputSchema.parse(payload)).toEqual(payload);
  });

  it('RecordInputSchema rejects a missing dimensionId', () => {
    expect(() => RecordInputSchema.parse({ sessionId: 1, comparisonId: null })).toThrow();
  });

  it('RecordInputSchema rejects a non-positive sessionId', () => {
    expect(() =>
      RecordInputSchema.parse({ sessionId: 0, dimensionId: 3, comparisonId: null })
    ).toThrow();
  });

  it('DismissInputSchema accepts a positive sessionId', () => {
    expect(DismissInputSchema.parse({ sessionId: 99 })).toEqual({ sessionId: 99 });
  });

  it('DismissInputSchema rejects a missing sessionId', () => {
    expect(() => DismissInputSchema.parse({})).toThrow();
  });

  it('ListPendingInputSchema accepts no filters', () => {
    expect(ListPendingInputSchema.parse({})).toEqual({});
  });

  it('ListPendingInputSchema accepts a media-tuple filter + pagination', () => {
    const payload: ListPendingInput = {
      mediaType: 'episode',
      mediaId: 7,
      limit: 25,
      offset: 50,
    };
    expect(ListPendingInputSchema.parse(payload)).toEqual(payload);
  });

  it('ListPendingInputSchema rejects an unknown mediaType', () => {
    expect(() => ListPendingInputSchema.parse({ mediaType: 'podcast', mediaId: 1 })).toThrow();
  });

  it('ListPendingInputSchema rejects a negative offset', () => {
    expect(() => ListPendingInputSchema.parse({ offset: -1 })).toThrow();
  });

  it('CreateInputSchema accepts a well-formed payload', () => {
    const payload: CreateInput = {
      watchHistoryId: 42,
      mediaType: 'movie',
      mediaId: 123,
    };
    expect(CreateInputSchema.parse(payload)).toEqual(payload);
  });

  it('CreateInputSchema rejects a missing mediaType', () => {
    expect(() => CreateInputSchema.parse({ watchHistoryId: 42, mediaId: 123 })).toThrow();
  });

  it('CreateInputSchema rejects a missing mediaId', () => {
    expect(() => CreateInputSchema.parse({ watchHistoryId: 42, mediaType: 'movie' })).toThrow();
  });

  it('GetInputSchema accepts a positive sessionId', () => {
    expect(GetInputSchema.parse({ sessionId: 1 })).toEqual({ sessionId: 1 });
  });

  it('GetByMediaInputSchema accepts a well-formed payload', () => {
    const payload: GetByMediaInput = { mediaType: 'movie', mediaId: 123 };
    expect(GetByMediaInputSchema.parse(payload)).toEqual(payload);
  });

  it('GetByMediaInputSchema rejects a payload missing mediaType', () => {
    expect(() => GetByMediaInputSchema.parse({ mediaId: 123 })).toThrow();
  });

  it('GetByMediaInputSchema rejects a payload missing mediaId', () => {
    expect(() => GetByMediaInputSchema.parse({ mediaType: 'movie' })).toThrow();
  });

  it('GetByMediaInputSchema rejects an unknown mediaType', () => {
    expect(() => GetByMediaInputSchema.parse({ mediaType: 'podcast', mediaId: 1 })).toThrow();
  });

  it('LogWatchCompletionInputSchema accepts a well-formed payload', () => {
    const payload: LogWatchCompletionInput = {
      watchHistoryId: 42,
      mediaType: 'movie',
      mediaId: 123,
    };
    expect(LogWatchCompletionInputSchema.parse(payload)).toEqual(payload);
  });

  it('LogWatchCompletionInputSchema rejects a non-positive watchHistoryId', () => {
    expect(() =>
      LogWatchCompletionInputSchema.parse({
        watchHistoryId: 0,
        mediaType: 'movie',
        mediaId: 123,
      })
    ).toThrow();
  });

  it('DeleteByWatchHistoryIdInputSchema accepts a positive watchHistoryId', () => {
    expect(DeleteByWatchHistoryIdInputSchema.parse({ watchHistoryId: 42 })).toEqual({
      watchHistoryId: 42,
    });
  });

  it('DeleteByWatchHistoryIdInputSchema rejects a missing watchHistoryId', () => {
    expect(() => DeleteByWatchHistoryIdInputSchema.parse({})).toThrow();
  });
});
