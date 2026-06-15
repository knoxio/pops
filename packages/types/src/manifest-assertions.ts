/**
 * Internal structural-validation helpers for `assertModuleManifest`. Split
 * out from `module-manifest.ts` to keep that file's exported surface and the
 * runtime checks in tractable file sizes. Not re-exported from
 * `@pops/types`; consumers call `assertModuleManifest` instead.
 *
 * The frontend-side checks (overlay + `frontend.captureOverlay`,
 * PRD-246 US-03) live in `./manifest-frontend-assertions.ts` to keep
 * each file under the lint `max-lines` cap. `assertFrontend` is
 * re-exported from this module so callers continue to import every
 * assertion from a single path.
 */
import { fail, isObject, assertNonEmptyString } from './manifest-assertions-core.js';

export { assertFrontend } from './manifest-frontend-assertions.js';
export { fail, isObject, assertNonEmptyString } from './manifest-assertions-core.js';

import type { ModuleSurface } from './module-manifest.js';

export function assertSurfaces(value: unknown, context: string): readonly ModuleSurface[] {
  if (!Array.isArray(value) || value.length === 0) {
    fail(context, `'surfaces' must be a non-empty array`);
  }
  for (const s of value as readonly unknown[]) {
    if (s !== 'app' && s !== 'overlay') {
      fail(context, `invalid surface '${String(s)}'`);
    }
  }
  return value as readonly ModuleSurface[];
}

export function assertCapabilities(value: unknown, context: string, moduleId: string): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    fail(context, `'capabilities' must be an array when set`);
  }
  for (const [i, cap] of (value as readonly unknown[]).entries()) {
    if (typeof cap !== 'string' || cap.length === 0) {
      fail(context, `'capabilities[${i}]' must be a non-empty string`);
    }
    const dot = cap.indexOf('.');
    if (dot <= 0) {
      fail(
        context,
        `'capabilities[${i}]' must be namespaced as '<moduleId>.<scope>' (got '${cap}')`
      );
    }
    const ns = cap.slice(0, dot);
    if (ns !== moduleId) {
      fail(
        context,
        `'capabilities[${i}]' namespace '${ns}' does not match module id '${moduleId}'`
      );
    }
  }
}

export function assertSettings(value: unknown, context: string): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    fail(context, `'settings' must be an array when set`);
  }
  for (const [i, m] of (value as readonly unknown[]).entries()) {
    if (!isObject(m)) {
      fail(context, `'settings[${i}]' must be an object`);
    }
    assertNonEmptyString(m.id, context, `settings[${i}].id`);
    assertNonEmptyString(m.title, context, `settings[${i}].title`);
    if (typeof m.order !== 'number' || Number.isNaN(m.order)) {
      fail(context, `'settings[${i}].order' must be a number`);
    }
    if (!Array.isArray(m.groups)) {
      fail(context, `'settings[${i}].groups' must be an array`);
    }
  }
}

export function assertFeatures(value: unknown, context: string): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    fail(context, `'features' must be an array when set`);
  }
  for (const [i, m] of (value as readonly unknown[]).entries()) {
    if (!isObject(m)) {
      fail(context, `'features[${i}]' must be an object`);
    }
    assertNonEmptyString(m.id, context, `features[${i}].id`);
    assertNonEmptyString(m.title, context, `features[${i}].title`);
    if (typeof m.order !== 'number' || Number.isNaN(m.order)) {
      fail(context, `'features[${i}].order' must be a number`);
    }
    if (!Array.isArray(m.features)) {
      fail(context, `'features[${i}].features' must be an array`);
    }
  }
}

export function assertSearch(value: unknown, context: string): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    fail(context, `'search' must be an array when set`);
  }
  for (const [i, a] of (value as readonly unknown[]).entries()) {
    if (!isObject(a)) {
      fail(context, `'search[${i}]' must be an object`);
    }
    assertNonEmptyString(a.domain, context, `search[${i}].domain`);
    assertNonEmptyString(a.icon, context, `search[${i}].icon`);
    assertNonEmptyString(a.color, context, `search[${i}].color`);
    if (typeof a.search !== 'function') {
      fail(context, `'search[${i}].search' must be a function`);
    }
  }
}

export function assertUriHandler(value: unknown, context: string): void {
  if (value === undefined) return;
  if (!isObject(value)) {
    fail(context, `'uriHandler' must be an object when set`);
  }
  if (!Array.isArray(value.types) || value.types.length === 0) {
    fail(context, `'uriHandler.types' must be a non-empty array`);
  }
  for (const [i, t] of (value.types as readonly unknown[]).entries()) {
    if (typeof t !== 'string' || t.length === 0) {
      fail(context, `'uriHandler.types[${i}]' must be a non-empty string`);
    }
  }
  if (typeof value.resolve !== 'function') {
    fail(context, `'uriHandler.resolve' must be a function`);
  }
}

export function assertAiTools(value: unknown, context: string): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    fail(context, `'backend.aiTools' must be an array when set`);
  }
  for (const [i, t] of (value as readonly unknown[]).entries()) {
    if (!isObject(t)) {
      fail(context, `'backend.aiTools[${i}]' must be an object`);
    }
    assertNonEmptyString(t.name, context, `backend.aiTools[${i}].name`);
    assertNonEmptyString(t.description, context, `backend.aiTools[${i}].description`);
    if (!isObject(t.inputSchema)) {
      fail(context, `'backend.aiTools[${i}].inputSchema' must be an object`);
    }
    if (typeof t.handler !== 'function') {
      fail(context, `'backend.aiTools[${i}].handler' must be a function`);
    }
  }
}

export function assertMigrations(value: unknown, context: string): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    fail(context, `'backend.migrations' must be an array when set`);
  }
  for (const [i, m] of (value as readonly unknown[]).entries()) {
    if (!isObject(m)) {
      fail(context, `'backend.migrations[${i}]' must be an object`);
    }
    assertNonEmptyString(m.id, context, `backend.migrations[${i}].id`);
    if (typeof m.sql !== 'string') {
      fail(context, `'backend.migrations[${i}].sql' must be a string`);
    }
  }
}

export function assertIngestSources(value: unknown, context: string): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    fail(context, `'backend.ingestSources' must be an array when set`);
  }
  for (const [i, s] of (value as readonly unknown[]).entries()) {
    if (!isObject(s)) {
      fail(context, `'backend.ingestSources[${i}]' must be an object`);
    }
    assertNonEmptyString(s.id, context, `backend.ingestSources[${i}].id`);
    assertNonEmptyString(s.label, context, `backend.ingestSources[${i}].label`);
  }
}

export function assertBackend(value: unknown, context: string): void {
  if (value === undefined) return;
  if (!isObject(value)) {
    fail(context, `'backend' must be an object when set`);
  }
  if (value.router === undefined) {
    fail(context, `'backend.router' is required when 'backend' is set`);
  }
  assertAiTools(value.aiTools, context);
  assertMigrations(value.migrations, context);
  assertIngestSources(value.ingestSources, context);
}
