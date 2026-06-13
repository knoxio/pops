import { respondHttpError, respondTrpcError } from './responses.js';

import type { ServerResponse } from 'node:http';

export function handleSubscription(
  res: ServerResponse,
  path: string,
  url: URL,
  heartbeatMs: number
): void {
  if (!validateInput(res, url, path)) return;

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  if (path === 'fixture.tick') {
    streamTick(res);
    return;
  }
  if (path === 'fixture.idle') {
    streamIdle(res, heartbeatMs);
    return;
  }
  if (path === 'fixture.errorStream') {
    streamError(res);
    return;
  }
  respondTrpcError(res, 'NOT_FOUND', `unknown subscription ${path}`, { path });
}

function validateInput(res: ServerResponse, url: URL, path: string): boolean {
  const rawInput = url.searchParams.get('input');
  if (rawInput === null) {
    respondHttpError(res, {
      httpStatus: 400,
      code: 'BAD_REQUEST',
      message: 'missing input query',
      extraData: { path },
    });
    return false;
  }
  try {
    JSON.parse(rawInput);
    return true;
  } catch {
    respondHttpError(res, {
      httpStatus: 400,
      code: 'BAD_REQUEST',
      message: 'malformed input query',
      extraData: { path },
    });
    return false;
  }
}

function streamTick(res: ServerResponse): void {
  res.write(`id: 1\ndata: ${JSON.stringify({ result: { data: { tick: 1 } } })}\n\n`);
  res.write(`event: complete\ndata: {}\n\n`);
  res.end();
}

function streamIdle(res: ServerResponse, heartbeatMs: number): void {
  let stopped = false;
  res.on('close', () => {
    stopped = true;
  });
  const timer = setInterval(() => {
    if (stopped) {
      clearInterval(timer);
      return;
    }
    res.write(': keep-alive\n\n');
  }, heartbeatMs);
}

function streamError(res: ServerResponse): void {
  res.write(
    `event: error\ndata: ${JSON.stringify({ code: 'INTERNAL_SERVER_ERROR', message: 'simulated' })}\n\n`
  );
  res.end();
}
