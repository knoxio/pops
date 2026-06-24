import { describe, expect, expectTypeOf, it } from 'vitest';

import { embeddingsProcedures } from '../schemas/embeddings-procedures.js';
import {
  EmbeddingsGetStatusInputSchema,
  EmbeddingsGetStatusOutputSchema,
  EmbeddingsListSourceIdsByTypeInputSchema,
  EmbeddingsListSourceIdsByTypeOutputSchema,
} from '../schemas/embeddings.js';

import type { z } from 'zod';

import type {
  EmbeddingsGetStatusInput,
  EmbeddingsGetStatusOutput,
  EmbeddingsListSourceIdsByTypeInput,
  EmbeddingsListSourceIdsByTypeOutput,
} from '../types/embeddings.js';

describe('@pops/cerebrum — cerebrum.embeddings.*', () => {
  describe('round-trip type ↔ schema', () => {
    it('EmbeddingsGetStatusInput ↔ EmbeddingsGetStatusInputSchema agree structurally', () => {
      expectTypeOf<
        z.infer<typeof EmbeddingsGetStatusInputSchema>
      >().toEqualTypeOf<EmbeddingsGetStatusInput>();
    });

    it('EmbeddingsGetStatusOutput ↔ EmbeddingsGetStatusOutputSchema agree structurally', () => {
      expectTypeOf<
        z.infer<typeof EmbeddingsGetStatusOutputSchema>
      >().toEqualTypeOf<EmbeddingsGetStatusOutput>();
    });

    it('EmbeddingsListSourceIdsByTypeInput ↔ schema agree structurally', () => {
      expectTypeOf<
        z.infer<typeof EmbeddingsListSourceIdsByTypeInputSchema>
      >().toEqualTypeOf<EmbeddingsListSourceIdsByTypeInput>();
    });

    it('EmbeddingsListSourceIdsByTypeOutput ↔ schema agree structurally', () => {
      expectTypeOf<
        z.infer<typeof EmbeddingsListSourceIdsByTypeOutputSchema>
      >().toEqualTypeOf<EmbeddingsListSourceIdsByTypeOutput>();
    });
  });

  describe('EmbeddingsGetStatusInputSchema', () => {
    it('accepts an empty object (sourceType omitted)', () => {
      expect(EmbeddingsGetStatusInputSchema.parse({})).toEqual({});
    });

    it('accepts a known source type', () => {
      const input: EmbeddingsGetStatusInput = { sourceType: 'engram' };
      expect(EmbeddingsGetStatusInputSchema.parse(input)).toEqual(input);
    });

    it('rejects an empty-string sourceType', () => {
      expect(() => EmbeddingsGetStatusInputSchema.parse({ sourceType: '' })).toThrow();
    });

    it('rejects a non-string sourceType', () => {
      expect(() => EmbeddingsGetStatusInputSchema.parse({ sourceType: 42 })).toThrow();
    });
  });

  describe('EmbeddingsGetStatusOutputSchema', () => {
    it('accepts the canonical zero-row response', () => {
      const out: EmbeddingsGetStatusOutput = { total: 0, pending: 0, stale: 0 };
      expect(EmbeddingsGetStatusOutputSchema.parse(out)).toEqual(out);
    });

    it('accepts a populated total with placeholder pending/stale', () => {
      const out: EmbeddingsGetStatusOutput = { total: 12, pending: 0, stale: 0 };
      expect(EmbeddingsGetStatusOutputSchema.parse(out)).toEqual(out);
    });

    it('rejects a missing total', () => {
      expect(() => EmbeddingsGetStatusOutputSchema.parse({ pending: 0, stale: 0 })).toThrow();
    });

    it('rejects a negative total', () => {
      expect(() =>
        EmbeddingsGetStatusOutputSchema.parse({ total: -1, pending: 0, stale: 0 })
      ).toThrow();
    });

    it('rejects a non-integer total', () => {
      expect(() =>
        EmbeddingsGetStatusOutputSchema.parse({ total: 3.5, pending: 0, stale: 0 })
      ).toThrow();
    });
  });

  describe('EmbeddingsListSourceIdsByTypeInputSchema', () => {
    it('accepts a non-empty sourceType', () => {
      const input: EmbeddingsListSourceIdsByTypeInput = { sourceType: 'engram' };
      expect(EmbeddingsListSourceIdsByTypeInputSchema.parse(input)).toEqual(input);
    });

    it('rejects a missing sourceType', () => {
      expect(() => EmbeddingsListSourceIdsByTypeInputSchema.parse({})).toThrow();
    });

    it('rejects an empty-string sourceType', () => {
      expect(() => EmbeddingsListSourceIdsByTypeInputSchema.parse({ sourceType: '' })).toThrow();
    });
  });

  describe('EmbeddingsListSourceIdsByTypeOutputSchema', () => {
    it('accepts an empty sourceIds list', () => {
      const out: EmbeddingsListSourceIdsByTypeOutput = { sourceIds: [] };
      expect(EmbeddingsListSourceIdsByTypeOutputSchema.parse(out)).toEqual(out);
    });

    it('accepts a populated sourceIds list', () => {
      const out: EmbeddingsListSourceIdsByTypeOutput = {
        sourceIds: ['eng_1', 'eng_2', 'eng_3'],
      };
      expect(EmbeddingsListSourceIdsByTypeOutputSchema.parse(out)).toEqual(out);
    });

    it('rejects a non-array sourceIds', () => {
      expect(() =>
        EmbeddingsListSourceIdsByTypeOutputSchema.parse({ sourceIds: 'eng_1' })
      ).toThrow();
    });

    it('rejects a non-string element', () => {
      expect(() =>
        EmbeddingsListSourceIdsByTypeOutputSchema.parse({ sourceIds: ['eng_1', 42] })
      ).toThrow();
    });
  });

  describe('embeddingsProcedures descriptor', () => {
    it('pins both procedures to the `query` (read-only) method', () => {
      expect(embeddingsProcedures.getStatus.method).toBe('query');
      expect(embeddingsProcedures.listSourceIdsByType.method).toBe('query');
    });

    it('exposes exactly the two read-only procedures', () => {
      expect(Object.keys(embeddingsProcedures).toSorted()).toEqual([
        'getStatus',
        'listSourceIdsByType',
      ]);
    });

    it('references the canonical schema instances for getStatus', () => {
      expect(embeddingsProcedures.getStatus.input).toBe(EmbeddingsGetStatusInputSchema);
      expect(embeddingsProcedures.getStatus.output).toBe(EmbeddingsGetStatusOutputSchema);
    });

    it('references the canonical schema instances for listSourceIdsByType', () => {
      expect(embeddingsProcedures.listSourceIdsByType.input).toBe(
        EmbeddingsListSourceIdsByTypeInputSchema
      );
      expect(embeddingsProcedures.listSourceIdsByType.output).toBe(
        EmbeddingsListSourceIdsByTypeOutputSchema
      );
    });
  });
});
