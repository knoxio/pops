/**
 * Shared test helpers for MCP / AI tool tests.
 *
 * Works against either the MCP-SDK `CallToolResult` shape or the
 * platform-neutral `AiToolResult` shape from `@pops/types`. Both expose a
 * text-block `content` array and an optional `isError` flag — the helpers
 * only require the structural subset.
 */
interface TextResultLike {
  content: readonly { type: string; text?: string }[];
  isError?: boolean;
}

/**
 * Extract the text content from the first item in a tool result. Assumes the
 * first content item is a text block (which all cerebrum tools produce).
 */
export function extractText(result: TextResultLike): string {
  const first = result.content[0];
  if (first && typeof first.text === 'string') {
    return first.text;
  }
  return '{}';
}

/** Parse the JSON text content from a tool result. */
export function parseResult(result: TextResultLike): unknown {
  return JSON.parse(extractText(result));
}
