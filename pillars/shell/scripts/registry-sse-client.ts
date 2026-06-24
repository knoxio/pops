/**
 * Minimal Node-side SSE consumer for `GET /registry/subscribe`
 * (docs/themes/federation/prds/subscription-model), used by the
 * event-driven nginx reloader.
 *
 * Uses global `fetch` + `ReadableStream` so the script has no runtime
 * dependency beyond Node 22+ (the pinned engine). Parses just enough of
 * the SSE framing to surface `(event, data)` tuples; multi-line `data:`
 * payloads are concatenated per spec.
 *
 * Reconnect is delegated to the caller via the `onError` hook + the
 * promise returned by `consume()` — the watcher entry-point loops with
 * exponential backoff so this module stays focused on framing.
 */

export interface SseFrame {
  readonly event: string;
  readonly data: string;
}

export interface ConsumeSseOptions {
  readonly url: string;
  readonly signal?: AbortSignal;
  readonly onFrame: (frame: SseFrame) => void;
  readonly fetchImpl?: typeof fetch;
}

/**
 * Connect to the SSE endpoint and dispatch frames until the response
 * stream ends or `signal` aborts. Resolves on natural end-of-stream;
 * rejects on network / HTTP errors so the caller can decide whether to
 * retry.
 */
export async function consumeSse(options: ConsumeSseOptions): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(options.url, {
    method: 'GET',
    headers: { accept: 'text/event-stream' },
    signal: options.signal,
  });
  if (!response.ok) {
    throw new Error(`SSE connect failed: ${response.status} ${response.statusText}`);
  }
  if (response.body === null) {
    throw new Error('SSE connect produced no response body');
  }
  await readEventStream(response.body, options.onFrame, options.signal);
}

async function readEventStream(
  body: ReadableStream<Uint8Array>,
  onFrame: (frame: SseFrame) => void,
  signal?: AbortSignal
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  try {
    for (;;) {
      if (signal?.aborted) break;
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = drainFrames(buffer, onFrame);
    }
    buffer += decoder.decode();
    drainFrames(buffer, onFrame);
  } finally {
    reader.releaseLock();
  }
}

function drainFrames(buffer: string, onFrame: (frame: SseFrame) => void): string {
  let remaining = buffer;
  for (;;) {
    const splitIndex = findFrameSplit(remaining);
    if (splitIndex < 0) return remaining;
    const rawFrame = remaining.slice(0, splitIndex);
    remaining = remaining.slice(splitIndex).replace(/^(\r\n\r\n|\n\n|\r\r)/, '');
    const frame = parseFrame(rawFrame);
    if (frame !== null) onFrame(frame);
  }
}

function findFrameSplit(buffer: string): number {
  const indices = [buffer.indexOf('\r\n\r\n'), buffer.indexOf('\n\n'), buffer.indexOf('\r\r')];
  let best = -1;
  for (const i of indices) {
    if (i >= 0 && (best < 0 || i < best)) best = i;
  }
  return best;
}

function parseFrame(raw: string): SseFrame | null {
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of raw.split(/\r\n|\n|\r/)) {
    if (line.length === 0 || line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon < 0 ? line : line.slice(0, colon);
    const rawValue = colon < 0 ? '' : line.slice(colon + 1);
    const value = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue;
    if (field === 'event') event = value;
    else if (field === 'data') dataLines.push(value);
  }
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join('\n') };
}
