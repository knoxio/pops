import { runInstagramIngest } from './instagram.js';
import { runScreenshotIngest } from './screenshot.js';
import { runTextIngest } from './text.js';
import { runWebUrlIngest } from './web-url.js';

import type { IngestHandler } from './types.js';

/**
 * Per-kind dispatch table. Injecting it into `runIngestJob` lets unit
 * tests substitute deterministic mocks without monkey-patching imports.
 *
 * Each handler matches its `IngestJobData` discriminator. The compiler
 * enforces exhaustiveness via the `IngestHandlerRegistry` shape — adding
 * a new kind without an entry will fail typecheck.
 */
export interface IngestHandlerRegistry {
  'url-web': IngestHandler<'url-web'>;
  'url-instagram': IngestHandler<'url-instagram'>;
  screenshot: IngestHandler<'screenshot'>;
  text: IngestHandler<'text'>;
}

export const defaultHandlers: IngestHandlerRegistry = {
  'url-web': runWebUrlIngest,
  'url-instagram': runInstagramIngest,
  screenshot: runScreenshotIngest,
  text: runTextIngest,
};

export type { HandlerContext, IngestHandler } from './types.js';
