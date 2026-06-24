/**
 * URI resolver dispatcher (ADR-012).
 *
 * Parses a `pops:{moduleId}/{type}/{id}` URI, looks up the owning module in
 * the registry view, and dispatches to its `uriHandler.resolve` if the module
 * is installed and declares a handler for the type.
 *
 * The dispatcher never throws on missing data — every error path produces a
 * typed `UriResolverResult` so the caller can render a placeholder.
 *
 * The registry view is passed as an argument rather than imported as a global
 * so unit tests can supply minimal fakes without a full backend stand-up.
 */
import { parseUri } from './parse.js';

import type { ModuleManifest, UriResolverResult } from '@pops/types';

/**
 * The minimum manifest shape the resolver depends on. Accepts the full
 * `ModuleManifest` (or `readonly ModuleManifest[]`) without requiring
 * consumers to narrow.
 */
export type UriRegistryView = ReadonlyArray<ModuleManifest>;

/** Module-installation predicate the resolver consults before dispatching. */
export type IsModuleInstalled = (moduleId: string) => boolean;

export interface ResolveUriOptions {
  /** Aggregated manifest list of modules that declare a `uriHandler`. */
  registry: UriRegistryView;
  /** Returns true when `moduleId` is in the live install set. */
  isInstalled: IsModuleInstalled;
}

/**
 * Resolve a `pops:{module}/{type}/{id}` URI to a typed `UriResolverResult`.
 *
 * Order of checks:
 *   1. Parse the URI per ADR-012; malformed input returns `malformed`.
 *   2. Check the install set; absent owning module returns `module-absent`.
 *   3. Look up the manifest's `uriHandler`; missing handler or type returns
 *      `not-found`.
 *   4. Call `uriHandler.resolve(type, id)` and translate its narrow result
 *      to the dispatcher's `UriResolverResult` shape.
 */
export async function resolveUri(
  uri: string,
  { registry, isInstalled }: ResolveUriOptions
): Promise<UriResolverResult> {
  const parsed = parseUri(uri);
  if (!parsed.ok) {
    return { kind: 'malformed', uri, reason: parsed.reason };
  }

  const { moduleId, type, id } = parsed.parsed;

  if (!isInstalled(moduleId)) {
    return { kind: 'module-absent', moduleId };
  }

  const manifest = registry.find((m) => m.id === moduleId);
  if (!manifest?.uriHandler || !manifest.uriHandler.types.includes(type)) {
    return { kind: 'not-found', moduleId, type, id };
  }

  // Guard the handler call: the resolver contract is non-throwing, so a
  // misbehaving module shouldn't bubble exceptions through the dispatcher.
  // Unknown errors map to `not-found` — the caller renders a placeholder.
  let result;
  try {
    result = await manifest.uriHandler.resolve(type, id);
  } catch {
    return { kind: 'not-found', moduleId, type, id };
  }
  switch (result.kind) {
    case 'object':
      return { kind: 'object', moduleId, type, id, data: result.data };
    case 'not-found':
      return { kind: 'not-found', moduleId, type, id };
    case 'module-absent':
      return { kind: 'module-absent', moduleId };
  }
}
