interface TextResultLike {
  content: readonly { type: string; text?: string }[];
  isError?: boolean;
}

export function extractText(result: TextResultLike): string {
  const first = result.content[0];
  return first && typeof first.text === 'string' ? first.text : '{}';
}

export function parseResult(result: TextResultLike): unknown {
  return JSON.parse(extractText(result));
}

/** Build a minimal tRPC client mock for the given procedure paths. */
export function buildClientMock(
  overrides: Record<string, Record<string, Record<string, { query?: unknown; mutation?: unknown }>>>
): unknown {
  return new Proxy(overrides, {
    get(target, domain: string) {
      const d = target[domain] ?? {};
      return new Proxy(d, {
        get(t, router: string) {
          const r = t[router] ?? {};
          return new Proxy(r, {
            get(rt, proc: string) {
              return rt[proc] ?? {};
            },
          });
        },
      });
    },
  });
}
