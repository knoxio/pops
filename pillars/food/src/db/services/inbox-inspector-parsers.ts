/**
 * PRD-135 — JSON parsing helpers for the inspector composer.
 *
 * Keeps the parse-and-narrow logic out of the main service module so it
 * stays under the per-file line cap. Both helpers return `null` on
 * malformed input rather than throwing — the inspector surfaces that as
 * "no compile error" / "no meta" which is the right UX for a corrupted
 * row, and lets the read query stay fire-and-go for the rest of the view.
 */
import type { SourceSpan } from '../../dsl/ast.js';
import type { CompilePhase } from '../../dsl/compile-types.js';
import type { InspectorCompileErrorParsed } from './inbox-inspector-types.js';

/**
 * Parses `recipe_versions.compile_error` (PRD-116's `CompileErrorJson`
 * envelope) into the wire-friendly `InspectorCompileErrorParsed` shape.
 * `proposedSlugsCount` is supplied by the caller from the
 * `recipe_version_proposed_slugs` row count so the parsed view stays in
 * sync even if PRD-116's persisted `proposedSlugsCount` field drifts.
 */
export function parseCompileErrorJson(
  raw: string | null,
  proposedSlugsCount: number
): InspectorCompileErrorParsed | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  const phase = parsePhase(obj.phase);
  if (phase === null) return null;
  const errors = parseErrors(obj.errors);
  return {
    phase,
    errors,
    errorCount: errors.length,
    proposedSlugsCount,
  };
}

function parsePhase(raw: unknown): CompilePhase | null {
  if (raw === 'parse' || raw === 'resolve' || raw === 'cycle' || raw === 'materialise') {
    return raw;
  }
  return null;
}

function parseErrors(raw: unknown): Array<{ code: string; message: string; loc?: SourceSpan }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ code: string; message: string; loc?: SourceSpan }> = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const entry = item as Record<string, unknown>;
    const code = typeof entry.code === 'string' ? entry.code : null;
    const message = typeof entry.message === 'string' ? entry.message : null;
    if (code === null || message === null) continue;
    const loc = parseLoc(entry.loc);
    out.push(loc === null ? { code, message } : { code, message, loc });
  }
  return out;
}

function parseLoc(raw: unknown): SourceSpan | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const startLine = numericField(obj.startLine);
  const startCol = numericField(obj.startCol);
  const endLine = numericField(obj.endLine);
  const endCol = numericField(obj.endCol);
  if (startLine === null || startCol === null || endLine === null || endCol === null) {
    return null;
  }
  return { startLine, startCol, endLine, endCol };
}

function numericField(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

/**
 * PRD-135 — defensive parser for `recipe_version_proposed_slugs.from_loc_json`.
 *
 * The rest of the inspector composer collapses corrupted JSON to a safe
 * fallback rather than throwing (Copilot R1 — a single malformed row would
 * tank the entire inspector read otherwise). The fallback returns a 1:1
 * span pointing at the start of the document so the editor's cursor-move
 * lands somewhere sensible if a click on the corrupt row reaches the
 * proposed-slug list.
 */
export const FALLBACK_SOURCE_SPAN: SourceSpan = Object.freeze({
  startLine: 1,
  startCol: 1,
  endLine: 1,
  endCol: 1,
});

export function safeParseSourceSpan(raw: string): SourceSpan {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return FALLBACK_SOURCE_SPAN;
    const obj = parsed as Record<string, unknown>;
    const startLine = numericField(obj.startLine);
    const startCol = numericField(obj.startCol);
    const endLine = numericField(obj.endLine);
    const endCol = numericField(obj.endCol);
    if (startLine === null || startCol === null || endLine === null || endCol === null) {
      return FALLBACK_SOURCE_SPAN;
    }
    return { startLine, startCol, endLine, endCol };
  } catch {
    return FALLBACK_SOURCE_SPAN;
  }
}

/**
 * Returns the parsed `ingest_sources.extracted_json` payload. The inspector
 * provenance pane consumes it as opaque `Record<string, unknown>` and
 * narrows per ingest kind in the UI (`url-instagram` reads `stages.stt`,
 * etc.). Returns `null` for any input that isn't a parseable JSON object —
 * primitives, arrays, and malformed strings all collapse to `null` so the
 * UI's `meta !== null` guard reliably gates the per-kind narrowing.
 */
export function parseExtractedMeta(raw: string | null): Record<string, unknown> | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
}
