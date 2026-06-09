import type { CycleError } from './cycle-types.js';
import type { ParseError } from './errors.js';
import type { ResolveError } from './resolver-types.js';

export type CompilePhase = 'parse' | 'resolve' | 'cycle' | 'materialise';

export interface MaterialiseError {
  code: 'MaterialiseError';
  message: string;
  /** Underlying SQLite error code when available (e.g. SQLITE_CONSTRAINT). */
  cause?: string;
}

export type CompileError = ParseError | ResolveError | CycleError | MaterialiseError;

export type CompileResult =
  | {
      ok: true;
      lineCount: number;
      stepCount: number;
      creationCount: number;
    }
  | {
      ok: false;
      phase: CompilePhase;
      errors: readonly CompileError[];
    };

/** Persisted in `recipe_versions.compile_error` when compile fails. */
export interface CompileErrorJson {
  phase: CompilePhase;
  errors: readonly CompileError[];
  proposedSlugsCount: number;
}
