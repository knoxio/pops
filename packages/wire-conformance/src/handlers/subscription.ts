import { assertErrorEnvelope, expectStatus, type ErrorEnvelope } from '../error-envelope.js';
import { readSseFrames } from '../sse.js';
import { safeCancel, withTimeout, type Handler } from './context.js';

export const wf08: Handler = async (ctx) => {
  const url = `${ctx.baseUrl}/trpc/${ctx.probes.subscriptionProcedure}?input=null`;
  const res = await ctx.fetchImpl(url, {
    method: 'GET',
    headers: { Accept: 'text/event-stream' },
  });
  try {
    expectStatus(res.status, 200, 'status');
    const ct = res.headers.get('content-type') ?? '';
    if (!/text\/event-stream/i.test(ct) || !/charset=utf-8/i.test(ct)) {
      throw new Error(`expected text/event-stream; charset=utf-8, got "${ct}"`);
    }
  } finally {
    await safeCancel(res);
  }
};

export const wf09: Handler = async (ctx) => {
  const url = `${ctx.baseUrl}/trpc/${ctx.probes.subscriptionProcedure}?input=null`;
  const res = await ctx.fetchImpl(url, {
    method: 'GET',
    headers: { Accept: 'text/event-stream' },
  });
  if (res.body === null) throw new Error('subscription body must be a stream');
  let sawData = false;
  try {
    for await (const frame of readSseFrames(res.body)) {
      if (frame.data === undefined || frame.event !== undefined) continue;
      const parsed = JSON.parse(frame.data) as { result?: { data?: unknown } };
      if (parsed.result === undefined || parsed.result.data === undefined) {
        throw new Error(`data frame must wrap { result: { data } }, got ${frame.data}`);
      }
      sawData = true;
      break;
    }
  } finally {
    await safeCancel(res);
  }
  if (!sawData) throw new Error('no data frame observed');
};

export const wf10: Handler = async (ctx) => {
  const url = `${ctx.baseUrl}/trpc/${ctx.probes.idleSubscriptionProcedure}?input=null`;
  const res = await ctx.fetchImpl(url, {
    method: 'GET',
    headers: { Accept: 'text/event-stream' },
  });
  if (res.body === null) throw new Error('subscription body must be a stream');
  const heartbeat = await withTimeout(findHeartbeat(res), 20_000, () => safeCancel(res));
  await safeCancel(res);
  if (!heartbeat) throw new Error('no heartbeat comment observed within 20s');
};

async function findHeartbeat(res: Response): Promise<boolean> {
  const body = res.body as ReadableStream<Uint8Array>;
  for await (const frame of readSseFrames(body)) {
    if (frame.comment !== undefined) return true;
  }
  return false;
}

export const wf11: Handler = async (ctx) => {
  const url = `${ctx.baseUrl}/trpc/${ctx.probes.errorSubscriptionProcedure}?input=null`;
  const res = await ctx.fetchImpl(url, {
    method: 'GET',
    headers: { Accept: 'text/event-stream' },
  });
  if (res.body === null) throw new Error('subscription body must be a stream');
  const { errorEvent, framesAfter } = await collectErrorStream(res);
  if (errorEvent === undefined) throw new Error('no event: error frame observed');
  if (typeof errorEvent.code !== 'string' || typeof errorEvent.message !== 'string') {
    throw new Error('error event must carry { code, message }');
  }
  if (framesAfter > 0) throw new Error('server must close stream after event: error');
};

function step(
  frame: { event?: string; data?: string },
  current: { code?: unknown; message?: unknown } | undefined
): { errorEvent?: { code?: unknown; message?: unknown }; afterCount: number } {
  if (current !== undefined) {
    const afterCount = frame.data !== undefined || frame.event !== undefined ? 1 : 0;
    return { afterCount };
  }
  if (frame.event === 'error' && frame.data !== undefined) {
    return {
      errorEvent: JSON.parse(frame.data) as { code?: unknown; message?: unknown },
      afterCount: 0,
    };
  }
  return { afterCount: 0 };
}

async function collectErrorStream(res: Response): Promise<{
  errorEvent?: { code?: unknown; message?: unknown };
  framesAfter: number;
}> {
  let errorEvent: { code?: unknown; message?: unknown } | undefined;
  let framesAfter = 0;
  try {
    for await (const frame of readSseFrames(res.body as ReadableStream<Uint8Array>)) {
      const next = step(frame, errorEvent);
      if (next.errorEvent !== undefined) errorEvent = next.errorEvent;
      framesAfter += next.afterCount;
    }
  } finally {
    await safeCancel(res);
  }
  const out: { errorEvent?: { code?: unknown; message?: unknown }; framesAfter: number } = {
    framesAfter,
  };
  if (errorEvent !== undefined) out.errorEvent = errorEvent;
  return out;
}

export const wf12: Handler = async (ctx) => {
  const url = `${ctx.baseUrl}/trpc/${ctx.probes.subscriptionProcedure}?input=%7Bnot-json`;
  const res = await ctx.fetchImpl(url, {
    method: 'GET',
    headers: { Accept: 'text/event-stream' },
  });
  if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
  const ct = res.headers.get('content-type') ?? '';
  if (!/application\/json/i.test(ct)) {
    throw new Error(`expected application/json body for bad input, got "${ct}"`);
  }
  const body = (await res.json()) as ErrorEnvelope;
  assertErrorEnvelope(body);
  if (body.error.code !== 'BAD_REQUEST') {
    throw new Error(`expected BAD_REQUEST, got ${body.error.code}`);
  }
};
