import { defaultHandlers } from './handlers/index.js';

import type { IngestJobData, IngestJobResult } from '../contract/queue/index.js';
import type { IngestHandlerRegistry } from './handlers/index.js';
import type { HandlerContext } from './handlers/types.js';

/**
 * Routes a `food.ingest` job to its per-kind handler. The switch over the
 * `data.kind` discriminator carries the narrowed type into each handler — no
 * `as` cast needed — and the compiler enforces exhaustiveness via the
 * `never`-typed default branch.
 */
export async function runIngestJob(
  data: IngestJobData,
  ctx: HandlerContext,
  handlers: IngestHandlerRegistry = defaultHandlers
): Promise<IngestJobResult> {
  switch (data.kind) {
    case 'url-web':
      return handlers['url-web'](data, ctx);
    case 'url-instagram':
      return handlers['url-instagram'](data, ctx);
    case 'screenshot':
      return handlers.screenshot(data, ctx);
    case 'text':
      return handlers.text(data, ctx);
    default: {
      const exhaustive: never = data;
      throw new Error(`Unhandled ingest kind: ${JSON.stringify(exhaustive)}`);
    }
  }
}
