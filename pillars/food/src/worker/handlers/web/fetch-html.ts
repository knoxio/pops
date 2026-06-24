/**
 * Minimal HTML fetcher shared by the JSON-LD path and the LLM-fallback
 * path. Uses the Undici `fetch` global (Node 20+):
 *
 *   - Per-request timeout enforced via AbortSignal.timeout.
 *   - Caps redirect hops explicitly (Undici default is 20).
 *   - Rejects non-`text/html*` content types.
 *   - Streams the body and rejects oversized responses so we don't buffer
 *     a hostile gigabyte.
 *   - Identifiable User-Agent string.
 */
import { readBodyWithCap } from './fetch-html-body.js';
import { followRedirects, type ResolvedFetchOptions } from './fetch-html-redirect.js';

const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const HTML_CT_RE = /^(?:text\/html|application\/xhtml\+xml)\b/i;

export interface FetchHtmlOk {
  ok: true;
  html: string;
  finalUrl: string;
  status: number;
  bytes: number;
  durationMs: number;
}

export interface FetchHtmlFail {
  ok: false;
  errorCode: 'FetchFailed' | 'NotHtml' | 'BodyTooLarge' | 'FetchTimeout';
  errorMessage: string;
  status?: number;
  finalUrl?: string;
  durationMs: number;
}

export type FetchHtmlResult = FetchHtmlOk | FetchHtmlFail;

export interface FetchHtmlOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxRedirects?: number;
  maxBodyBytes?: number;
}

export async function fetchHtml(
  url: string,
  options: FetchHtmlOptions = {}
): Promise<FetchHtmlResult> {
  const resolved: ResolvedFetchOptions = {
    fetchImpl: options.fetchImpl ?? fetch,
    timeoutMs: options.timeoutMs ?? FETCH_TIMEOUT_MS,
    maxRedirects: options.maxRedirects ?? MAX_REDIRECTS,
    maxBodyBytes: options.maxBodyBytes ?? MAX_BODY_BYTES,
  };
  const start = Date.now();

  const followed = await followRedirects(url, resolved, start);
  if (followed.tag === 'failed') {
    return {
      ok: false,
      errorCode: followed.errorCode,
      errorMessage: followed.errorMessage,
      status: followed.status,
      finalUrl: followed.finalUrl,
      durationMs: followed.durationMs,
    };
  }
  const { response, currentUrl } = followed;

  const httpFail = validateStatus(response, currentUrl, start);
  if (httpFail !== null) return httpFail;
  const ctFail = validateContentType(response, currentUrl, start);
  if (ctFail !== null) return ctFail;

  return readBody(response, currentUrl, resolved.maxBodyBytes, start);
}

function validateStatus(response: Response, finalUrl: string, start: number): FetchHtmlFail | null {
  if (response.status >= 200 && response.status < 300) return null;
  return {
    ok: false,
    errorCode: 'FetchFailed',
    errorMessage: `HTTP ${response.status}`,
    status: response.status,
    finalUrl,
    durationMs: Date.now() - start,
  };
}

function validateContentType(
  response: Response,
  finalUrl: string,
  start: number
): FetchHtmlFail | null {
  const contentType = response.headers.get('content-type') ?? '';
  if (HTML_CT_RE.test(contentType)) return null;
  return {
    ok: false,
    errorCode: 'NotHtml',
    errorMessage: `unsupported content-type: ${contentType || '<missing>'}`,
    status: response.status,
    finalUrl,
    durationMs: Date.now() - start,
  };
}

async function readBody(
  response: Response,
  finalUrl: string,
  maxBodyBytes: number,
  start: number
): Promise<FetchHtmlResult> {
  const result = await readBodyWithCap(response, maxBodyBytes);
  if (result.tag === 'too-large') {
    return {
      ok: false,
      errorCode: 'BodyTooLarge',
      errorMessage: `body exceeded ${maxBodyBytes} bytes`,
      status: response.status,
      finalUrl,
      durationMs: Date.now() - start,
    };
  }
  if (result.tag === 'failed') {
    return {
      ok: false,
      errorCode: 'FetchFailed',
      errorMessage: result.message,
      status: response.status,
      finalUrl,
      durationMs: Date.now() - start,
    };
  }
  return {
    ok: true,
    html: result.text,
    finalUrl,
    status: response.status,
    bytes: result.bytes,
    durationMs: Date.now() - start,
  };
}
