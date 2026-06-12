import { PillarCallError, type CallResult } from './errors.js';

export type CallableProcedure<Args extends readonly unknown[], Output> = {
  (...args: Args): Promise<CallResult<Output>>;
  orThrow: (...args: Args) => Promise<Output>;
};

type ProcedureNode<T> = T extends (...args: infer Args) => infer Ret
  ? CallableProcedure<Args, Awaited<Ret>>
  : T extends Record<string, unknown>
    ? { [K in keyof T]: ProcedureNode<T[K]> }
    : CallableProcedure<readonly unknown[], unknown>;

export type PillarHandle<TRouter> =
  TRouter extends Record<string, unknown>
    ? { [K in keyof TRouter]: ProcedureNode<TRouter[K]> }
    : Record<string, ProcedureNode<unknown>>;

export type InvokeFn = (path: readonly string[], input: unknown) => Promise<CallResult<unknown>>;

export function buildPillarProxy(pillarId: string, invoke: InvokeFn): unknown {
  return buildBranch(pillarId, [], invoke);
}

function buildBranch(pillarId: string, path: readonly string[], invoke: InvokeFn): unknown {
  const target: Record<string, unknown> = {};
  return new Proxy(target, {
    get(_t, prop) {
      if (typeof prop !== 'string' || prop === 'then') return undefined;
      return buildCallable(pillarId, [...path, prop], invoke);
    },
  });
}

function buildCallable(pillarId: string, path: readonly string[], invoke: InvokeFn): unknown {
  const fn = (input?: unknown): Promise<CallResult<unknown>> => invoke(path, input);

  const handler: ProxyHandler<typeof fn> = {
    get(_t, prop) {
      if (prop === 'orThrow') return makeOrThrow(pillarId, fn);
      if (typeof prop !== 'string' || prop === 'then') return undefined;
      return buildCallable(pillarId, [...path, prop], invoke);
    },
    apply(_t, _thisArg, args: unknown[]) {
      return fn(args[0]);
    },
  };

  return new Proxy(fn, handler);
}

function makeOrThrow(
  pillarId: string,
  fn: (input?: unknown) => Promise<CallResult<unknown>>
): (input?: unknown) => Promise<unknown> {
  return async (input?: unknown): Promise<unknown> => {
    const result = await fn(input);
    if (result.kind === 'ok') return result.value;
    throw new PillarCallError(pillarId, result);
  };
}
