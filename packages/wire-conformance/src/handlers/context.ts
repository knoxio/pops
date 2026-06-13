import type { ConformanceProbes } from '../types.js';

export type Fetch = typeof fetch;

export type RunnerContext = {
  baseUrl: string;
  coreBaseUrl: string;
  apiKey: string;
  probes: ConformanceProbes;
  fetchImpl: Fetch;
};

export type Handler = (ctx: RunnerContext) => Promise<void>;

export async function safeCancel(res: Response): Promise<void> {
  try {
    await res.body?.cancel();
  } catch {
    // intentionally ignored — cancellation races are expected in SSE tests
  }
}

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  onTimeout: () => Promise<void> | void
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      void Promise.resolve(onTimeout()).finally(() => reject(new Error(`timed out after ${ms}ms`)));
    }, ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
