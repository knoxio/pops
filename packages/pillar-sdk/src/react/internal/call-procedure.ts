import { PillarCallError } from '../../client/errors.js';
import { pillar } from '../../client/factory.js';

import type { CallFailure, CallResult } from '../../client/errors.js';
import type { PillarClientOptions } from '../../client/factory.js';

export type ProcedurePath = readonly [string, ...string[]];

export type FailureFlags = {
  isContractMismatch: boolean;
  isUnavailable: boolean;
  isDegraded: boolean;
};

export const NO_FAILURE: FailureFlags = {
  isContractMismatch: false,
  isUnavailable: false,
  isDegraded: false,
};

export function failureFlagsFrom(failure: CallFailure): FailureFlags {
  return {
    isContractMismatch: failure.kind === 'contract-mismatch',
    isUnavailable: failure.kind === 'unavailable',
    isDegraded: failure.kind === 'degraded',
  };
}

export function callProcedure<TOutput>(
  pillarId: string,
  path: ProcedurePath,
  input: unknown,
  options: PillarClientOptions
): Promise<CallResult<TOutput>> {
  const handle = pillar<unknown>(pillarId, options);
  let node: unknown = handle;
  for (let i = 0; i < path.length - 1; i += 1) {
    const segment = path[i] as string;
    node = (node as Record<string, unknown>)[segment];
  }
  const leaf = (node as Record<string, unknown>)[path[path.length - 1] as string];
  if (typeof leaf !== 'function') {
    throw new PillarCallError(pillarId, {
      kind: 'contract-mismatch',
      pillar: pillarId,
      actual: path.join('.'),
    });
  }
  return (leaf as (i: unknown) => Promise<CallResult<TOutput>>)(input);
}
