import { engramReadSchema, handleEngramRead } from './engram-read.js';
import { engramWriteSchema, handleEngramWrite } from './engram-write.js';
/**
 * Cerebrum AI tool manifest — the `AiToolDescriptor[]` slot for the cerebrum
 * module's backend manifest (PRD-101 US-10).
 *
 * Each entry is a thin handler binding around a cerebrum service. The platform
 * aggregator (`apps/pops-api/src/mcp/tools/index.ts`) reads
 * `installedManifests().flatMap(m => m.backend?.aiTools ?? [])` and exposes
 * the merged surface via MCP `tools/list` and Ego's tool context — there is
 * no per-module ad-hoc registration.
 */
import { cerebrumIngestSchema, handleCerebrumIngest } from './ingest.js';
import { cerebrumQuerySchema, handleCerebrumQuery } from './query.js';
import { cerebrumQuickCaptureSchema, handleCerebrumQuickCapture } from './quick-capture.js';
import { cerebrumSearchSchema, handleCerebrumSearch } from './search.js';

import type { AiToolDescriptor } from '@pops/types';

export const cerebrumAiTools: readonly AiToolDescriptor[] = [
  {
    name: 'cerebrum.search',
    description:
      'Search the Cerebrum knowledge base using hybrid semantic + structured search. Returns ranked results with titles, scores, scopes, and content snippets.',
    inputSchema: cerebrumSearchSchema,
    handler: handleCerebrumSearch,
  },
  {
    name: 'cerebrum.ingest',
    description:
      'Ingest new content into the Cerebrum knowledge base. Accepts plain text, Markdown, or JSON. Runs classification, entity extraction, and scope inference automatically.',
    inputSchema: cerebrumIngestSchema,
    handler: handleCerebrumIngest,
  },
  {
    name: 'cerebrum.quick_capture',
    description:
      'Lowest-friction capture path — store a raw thought as an engram immediately. Classification, entity extraction, and scope inference run asynchronously. Use this when the agent has a single piece of raw text to land with zero ceremony.',
    inputSchema: cerebrumQuickCaptureSchema,
    handler: handleCerebrumQuickCapture,
  },
  {
    name: 'cerebrum.engram.read',
    description:
      'Read an engram by ID. Returns full metadata (title, type, scopes, tags, status, timestamps) and the body content.',
    inputSchema: engramReadSchema,
    handler: handleEngramRead,
  },
  {
    name: 'cerebrum.engram.write',
    description:
      'Update an existing engram. Can modify body, title, scopes, and/or tags. Returns updated metadata.',
    inputSchema: engramWriteSchema,
    handler: handleEngramWrite,
  },
  {
    name: 'cerebrum.query',
    description:
      'Ask a natural language question about the knowledge base. Returns a grounded answer with source citations. Limits retrieval to top-3 results for low latency.',
    inputSchema: cerebrumQuerySchema,
    handler: handleCerebrumQuery,
  },
];

export {
  handleCerebrumIngest,
  handleCerebrumQuery,
  handleCerebrumQuickCapture,
  handleCerebrumSearch,
  handleEngramRead,
  handleEngramWrite,
};
