/**
 * PRD-127 — body reader for the HTML fetcher. Streams the response body
 * with a hard cap so a hostile server can't make us OOM. Split out of
 * `fetch-html.ts` to keep each file under the per-file line cap.
 */

export type ReadBodyResult =
  | { tag: 'ok'; text: string; bytes: number }
  | { tag: 'too-large' }
  | { tag: 'failed'; message: string };

export async function readBodyWithCap(
  response: Response,
  maxBodyBytes: number
): Promise<ReadBodyResult> {
  const reader = response.body?.getReader();
  if (!reader) return readBodyFallback(response, maxBodyBytes);
  return readBodyStreaming(reader, maxBodyBytes);
}

async function readBodyFallback(response: Response, maxBodyBytes: number): Promise<ReadBodyResult> {
  try {
    const text = await response.text();
    const bytes = new TextEncoder().encode(text).byteLength;
    if (bytes > maxBodyBytes) return { tag: 'too-large' };
    return { tag: 'ok', text, bytes };
  } catch (err) {
    return { tag: 'failed', message: err instanceof Error ? err.message : String(err) };
  }
}

async function readBodyStreaming(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  maxBodyBytes: number
): Promise<ReadBodyResult> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    let done = false;
    while (!done) {
      const next = await reader.read();
      done = next.done;
      if (next.value === undefined) continue;
      total += next.value.byteLength;
      if (total > maxBodyBytes) {
        await reader.cancel();
        return { tag: 'too-large' };
      }
      chunks.push(next.value);
    }
  } catch (err) {
    return { tag: 'failed', message: err instanceof Error ? err.message : String(err) };
  }
  const buffer = concatBuffers(chunks, total);
  const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  return { tag: 'ok', text, bytes: total };
}

function concatBuffers(chunks: readonly Uint8Array[], total: number): Uint8Array {
  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return buffer;
}
