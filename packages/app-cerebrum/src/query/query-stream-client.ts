/**
 * Low-level SSE client for the Cerebrum Query streaming endpoint
 * (PRD-082, issue #2596).
 *
 * Fetches `/api/cerebrum/query/stream`, decodes the SSE wire format, and
 * dispatches structured `token`, `done` and `error` events to caller-
 * supplied handlers. Mirrors the shape of `useStreamingChat` in
 * `overlay-ego` so both surfaces share the same SSE conventions.
 */
import type { ValidatedQueryRequest } from './form-mapping';
import type { QueryConfidence, QuerySourceCitation } from './types';

/** SSE token event yielded while the LLM is still streaming. */
interface SseTokenEvent {
  type: 'token';
  text: string;
}

/** SSE done event yielded once the LLM stream completes. */
interface SseDoneEvent {
  type: 'done';
  answer: string;
  sources: QuerySourceCitation[];
  scopes: string[];
  confidence: QueryConfidence;
  tokensIn: number;
  tokensOut: number;
}

/** SSE error event yielded if the pipeline fails. */
interface SseErrorEvent {
  type: 'error';
  message: string;
}

type SseEvent = SseTokenEvent | SseDoneEvent | SseErrorEvent;

export interface StreamQueryCallbacks {
  /** Called for each `token` event. Receives the *cumulative* answer text. */
  onToken: (cumulativeAnswer: string) => void;
  /** Called when the pipeline emits its final `done` event. */
  onDone: (done: SseDoneEvent) => void;
  /** Called when the pipeline emits an `error` event or the fetch fails. */
  onError: (message: string) => void;
}

/** Parse a single `data: ...` line into a typed SSE event. */
function parseSseEvent(line: string): SseEvent | null {
  if (!line.startsWith('data: ')) return null;
  try {
    return JSON.parse(line.slice(6)) as SseEvent;
  } catch {
    return null;
  }
}

interface DispatchParams {
  event: SseEvent;
  cumulativeAnswer: { current: string };
  callbacks: StreamQueryCallbacks;
}

/** Apply a single decoded SSE event to the streaming state. */
function dispatchEvent(params: DispatchParams): void {
  const { event, cumulativeAnswer, callbacks } = params;
  if (event.type === 'token') {
    cumulativeAnswer.current += event.text;
    callbacks.onToken(cumulativeAnswer.current);
  } else if (event.type === 'done') {
    callbacks.onDone(event);
  } else if (event.type === 'error') {
    callbacks.onError(event.message);
  }
}

/** Read the SSE body chunk-by-chunk and dispatch each `data:` line. */
async function processStream(
  body: ReadableStream<Uint8Array>,
  callbacks: StreamQueryCallbacks
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const cumulativeAnswer = { current: '' };
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const event = parseSseEvent(trimmed);
      if (!event) continue;
      dispatchEvent({ event, cumulativeAnswer, callbacks });
    }
  }
}

/**
 * Stream a query answer from the SSE endpoint. Returns a Promise that
 * resolves once the server has closed the connection (or rejects with the
 * underlying fetch error). The caller is responsible for state management;
 * this function is intentionally side-effect free apart from the supplied
 * callbacks.
 */
export async function streamQuery(
  request: ValidatedQueryRequest,
  callbacks: StreamQueryCallbacks,
  init: { signal?: AbortSignal } = {}
): Promise<void> {
  const response = await fetch('/api/cerebrum/query/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: init.signal,
  });
  if (!response.ok) {
    throw new Error(`Stream request failed: ${response.status}`);
  }
  if (!response.body) {
    throw new Error('Response body is null');
  }
  await processStream(response.body, callbacks);
}
