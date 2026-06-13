import { describe, expect, it } from 'vitest';

import { toAnthropicToolResult, toOpenAiToolMessage } from '../provider-adapter.js';

import type { ToolResult } from '../types.js';

describe('toAnthropicToolResult', () => {
  it("serialises 'ok' as JSON content with is_error=false", () => {
    const result: ToolResult = { kind: 'ok', output: { hits: 3 } };
    expect(toAnthropicToolResult('tool_use_abc', result)).toEqual({
      type: 'tool_result',
      tool_use_id: 'tool_use_abc',
      content: '{"hits":3}',
      is_error: false,
    });
  });

  it("flags 'pillar-unavailable' as is_error=true with a human-readable message", () => {
    const block = toAnthropicToolResult('tu_1', {
      kind: 'pillar-unavailable',
      pillar: 'finance',
    });
    expect(block.is_error).toBe(true);
    expect(block.content).toMatch(/finance/);
    expect(block.content).toMatch(/offline/i);
  });

  it("flags 'tool-error' as is_error=true and includes the reason", () => {
    const block = toAnthropicToolResult('tu_2', { kind: 'tool-error', reason: 'timeout' });
    expect(block.is_error).toBe(true);
    expect(block.content).toMatch(/timeout/);
  });

  it("flags 'unknown-tool' as is_error=true and names the tool", () => {
    const block = toAnthropicToolResult('tu_3', {
      kind: 'unknown-tool',
      toolName: 'finance.ghost',
    });
    expect(block.is_error).toBe(true);
    expect(block.content).toMatch(/finance\.ghost/);
  });

  it('serialises null output without crashing', () => {
    const block = toAnthropicToolResult('tu_4', { kind: 'ok', output: null });
    expect(block.content).toBe('null');
  });
});

describe('toOpenAiToolMessage', () => {
  it("formats 'ok' as a role=tool message with JSON content", () => {
    expect(toOpenAiToolMessage('call_xyz', { kind: 'ok', output: [1, 2, 3] })).toEqual({
      role: 'tool',
      tool_call_id: 'call_xyz',
      content: '[1,2,3]',
    });
  });

  it("encodes 'pillar-unavailable' into the content string", () => {
    const msg = toOpenAiToolMessage('call_1', {
      kind: 'pillar-unavailable',
      pillar: 'cerebrum',
    });
    expect(msg.content).toMatch(/cerebrum/);
  });
});
