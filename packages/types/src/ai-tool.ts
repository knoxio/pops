/**
 * AI tool descriptor — per-module declaration of an MCP / Ego-callable tool
 * (PRD-101 US-10). The shape mirrors the MCP `Tool` definition: a name, a
 * human-readable description, a JSON-schema-like input schema, and a handler
 * function the MCP server (or Ego) calls when the tool is invoked.
 *
 * The platform consumer (US-10) aggregates `MODULES.flatMap(m => m.backend?.aiTools)`
 * into the MCP server's tool list. This package only defines the shape — no
 * MCP SDK dependency leaks into `@pops/types`.
 */

/** Result of invoking an AI tool — kept structural so MCP and other callers can interpret. */
export interface AiToolResult {
  /** Free-form content returned to the caller. MCP wraps this into `CallToolResult.content`. */
  content: readonly { type: 'text'; text: string }[];
  /** Set when the tool failed; MCP surfaces it as `isError: true`. */
  isError?: boolean;
}

/**
 * Handler signature. Receives the parsed input (validated against `inputSchema`
 * by the dispatcher) and returns the result. Async by contract — synchronous
 * tools wrap themselves in `Promise.resolve`.
 */
export type AiToolHandler<TInput = Record<string, unknown>> = (
  input: TInput
) => Promise<AiToolResult>;

export interface AiToolDescriptor<TInput = Record<string, unknown>> {
  /**
   * Globally unique tool name, namespaced by module: `cerebrum.search`,
   * `finance.transaction.find`. Two manifests declaring the same name is a
   * contract violation and the registry build (US-02) fails fast.
   */
  name: string;
  /** Human-readable description shown to the model when listing tools. */
  description: string;
  /**
   * JSON Schema describing the tool's input. The platform consumer passes
   * this through to MCP unchanged; the shape is left as `Record<string, unknown>`
   * to avoid pulling a JSON Schema dependency into `@pops/types`.
   */
  inputSchema: Record<string, unknown>;
  /** Handler invoked by the MCP dispatcher (or Ego) with the parsed input. */
  handler: AiToolHandler<TInput>;
}
