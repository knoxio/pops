/**
 * Format a `ToolResult` (PRD-202) into the shape the upstream AI provider
 * expects for a `tool_result` / `function` message. Anthropic and OpenAI
 * have nearly the same envelope; the differences are the field names
 * (`tool_use_id` vs `tool_call_id`) and the `is_error` flag (Anthropic
 * only — OpenAI infers errors from the content payload).
 *
 * The orchestrator owns turning these into provider SDK calls; this
 * module just produces the canonical payload so the same `ToolResult`
 * threads through both providers without bespoke branching at each
 * call-site.
 */
import type { ToolResult } from './types.js';

export type AnthropicToolResultBlock = {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error: boolean;
};

export type OpenAiToolMessage = {
  role: 'tool';
  tool_call_id: string;
  content: string;
};

export function toAnthropicToolResult(
  toolUseId: string,
  result: ToolResult
): AnthropicToolResultBlock {
  return {
    type: 'tool_result',
    tool_use_id: toolUseId,
    content: serialiseToolResult(result),
    is_error: result.kind !== 'ok',
  };
}

export function toOpenAiToolMessage(toolCallId: string, result: ToolResult): OpenAiToolMessage {
  return {
    role: 'tool',
    tool_call_id: toolCallId,
    content: serialiseToolResult(result),
  };
}

function serialiseToolResult(result: ToolResult): string {
  switch (result.kind) {
    case 'ok':
      return jsonStringify(result.output);
    case 'pillar-unavailable':
      return `Tool unavailable: the '${result.pillar}' pillar is offline. Try again later or use a different tool.`;
    case 'tool-error':
      return `Tool failed: ${result.reason}`;
    case 'unknown-tool':
      return `Unknown tool '${result.toolName}'. It is not registered with any healthy pillar.`;
  }
}

function jsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return String(value);
  }
}
