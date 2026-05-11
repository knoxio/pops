/**
 * Ego AI tool context — the merged tool descriptor list the conversation
 * engine assembles when offering tools to the LLM (PRD-101 US-10).
 *
 * Ego does not own a separate registry: it reads the same aggregator the
 * MCP server uses (`apps/pops-api/src/mcp/tools/index.ts`), which in turn
 * reads `installedManifests().flatMap(m => m.backend?.aiTools ?? [])`. The
 * two surfaces (MCP transport, ego conversation engine) consume identical
 * data — a tool added to a module's manifest reaches both at once.
 *
 * The engine does not (yet) invoke tools as part of the chat loop; the
 * `ChatMessage.toolCalls` slot is reserved for when it does. This module
 * exposes the merged list ahead of that wiring so any consumer that needs
 * tool metadata (e.g. system prompt augmentation, capability hinting) can
 * read it from a single place instead of re-implementing aggregation.
 */
import { listTools, type ToolDefinition } from '../../../mcp/tools/index.js';

/**
 * Return every AI tool an installed module exposes. The result mirrors the
 * MCP `tools/list` payload (name, description, inputSchema) so it can be
 * passed directly to an LLM tool-use API once ego's chat loop adds that
 * step.
 */
export function listAvailableAiTools(): readonly ToolDefinition[] {
  return listTools();
}
