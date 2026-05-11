/**
 * Platform-level AI tool registry — composes the `tools/list` view and the
 * `tools/call` dispatcher from the merged AI tool surface declared across
 * every installed module's manifest (PRD-101 US-10).
 *
 * Source of truth:
 *
 *   `installedManifests().flatMap(m => m.backend?.aiTools ?? [])`
 *
 * — there is no per-module ad-hoc registration. Adding a tool means adding
 * an `AiToolDescriptor` to a module's manifest; removing the module removes
 * the tool from `tools/list` and `tools/call` automatically.
 *
 * Tool-name uniqueness is enforced twice:
 *   - At registry build time (`packages/module-registry/scripts/lib.ts`)
 *     when an `aiTools` slot is included in a metadata-only entry.
 *   - At runtime here when the aggregator is materialised — a clash throws
 *     with both owning module ids named so the failure is loud and obvious.
 */
import { installedManifests } from '../../modules/installed-modules.js';

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import type { AiToolDescriptor, AiToolResult, ModuleManifest } from '@pops/types';

/** Public shape exposed to MCP `tools/list`. */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface AggregatedTool {
  descriptor: AiToolDescriptor;
  moduleId: string;
}

/**
 * Collect every AI tool declared by an installed module's manifest. Throws
 * with both owning module ids when two manifests declare the same tool
 * name — a contract violation the registry build is supposed to catch, but
 * the runtime double-check guards against drift (e.g. a metadata-only
 * registry entry that omits the `aiTools` slot).
 */
function aggregateTools(manifests: readonly ModuleManifest[]): readonly AggregatedTool[] {
  const out: AggregatedTool[] = [];
  const owner = new Map<string, string>();
  for (const m of manifests) {
    for (const tool of m.backend?.aiTools ?? []) {
      const previous = owner.get(tool.name);
      if (previous !== undefined) {
        throw new Error(
          `AI tool name '${tool.name}' is declared by both '${previous}' and '${m.id}'`
        );
      }
      owner.set(tool.name, m.id);
      out.push({ descriptor: tool, moduleId: m.id });
    }
  }
  return out;
}

function currentTools(): readonly AggregatedTool[] {
  return aggregateTools(installedManifests());
}

/**
 * MCP `tools/list` payload — the merged descriptor set from every installed
 * module's manifest, projected down to the wire shape (name, description,
 * inputSchema only).
 *
 * Implemented as a function so the value is re-resolved per call. This
 * matters in tests that swap `installedManifests()` via
 * `__setInstalledManifestsOverride` between cases — a cached snapshot would
 * leak the previous test's state.
 */
export function listTools(): readonly ToolDefinition[] {
  return currentTools().map(({ descriptor }) => ({
    name: descriptor.name,
    description: descriptor.description,
    inputSchema: descriptor.inputSchema,
  }));
}

function aiResultToCallToolResult(result: AiToolResult): CallToolResult {
  return result.isError === undefined
    ? { content: result.content.map((b) => ({ ...b })) }
    : { content: result.content.map((b) => ({ ...b })), isError: result.isError };
}

/**
 * Dispatch a tool call by name against the merged registry. Returns `null`
 * when no installed module declares a tool with that name — the MCP server
 * surfaces that as a `VALIDATION_ERROR` to the caller.
 */
export function dispatchTool(
  name: string,
  args: Record<string, unknown>
): Promise<CallToolResult> | null {
  const tool = currentTools().find((t) => t.descriptor.name === name);
  if (!tool) return null;
  return tool.descriptor.handler(args).then(aiResultToCallToolResult);
}
