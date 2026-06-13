export type SseFrame = {
  id?: string;
  event?: string;
  data?: string;
  comment?: string;
  raw: string;
};

/**
 * Read SSE frames from a `Response.body` stream.
 *
 * Yields one parsed frame per `\n\n` terminator. Heartbeat frames
 * (`:` prefix) are surfaced as `{ comment }` so the harness can assert
 * §4.4 heartbeat behaviour. Caller is responsible for cancelling the
 * stream when finished.
 */
export async function* readSseFrames(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<SseFrame, void, void> {
  const reader = body.getReader();
  try {
    yield* drain(reader);
  } finally {
    reader.releaseLock();
  }
}

async function* drain(
  reader: ReadableStreamDefaultReader<Uint8Array>
): AsyncGenerator<SseFrame, void, void> {
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (value !== undefined) buffer += decoder.decode(value, { stream: true });
    const { frames, rest } = splitFrames(buffer);
    buffer = rest;
    for (const frame of frames) yield frame;
    if (done) {
      yield* yieldTail(buffer);
      return;
    }
  }
}

function* yieldTail(buffer: string): Generator<SseFrame, void, void> {
  const tail = buffer.trim();
  if (tail.length > 0) yield parseFrame(tail);
}

function splitFrames(input: string): { frames: SseFrame[]; rest: string } {
  const frames: SseFrame[] = [];
  let remaining = input;
  let separator = remaining.indexOf('\n\n');
  while (separator !== -1) {
    const raw = remaining.slice(0, separator);
    remaining = remaining.slice(separator + 2);
    frames.push(parseFrame(raw));
    separator = remaining.indexOf('\n\n');
  }
  return { frames, rest: remaining };
}

function parseFrame(raw: string): SseFrame {
  const frame: SseFrame = { raw };
  for (const line of raw.split('\n')) {
    parseLine(frame, line);
  }
  return frame;
}

function parseLine(frame: SseFrame, line: string): void {
  if (line.length === 0) return;
  if (line.startsWith(':')) {
    frame.comment = line.slice(1).trimStart();
    return;
  }
  const colon = line.indexOf(':');
  if (colon === -1) return;
  const field = line.slice(0, colon);
  const value = line.slice(colon + 1).replace(/^ /, '');
  if (field === 'id') frame.id = value;
  else if (field === 'event') frame.event = value;
  else if (field === 'data') {
    frame.data = frame.data === undefined ? value : `${frame.data}\n${value}`;
  }
}
