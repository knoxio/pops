/**
 * Frontend-side structural-validation helpers (PRD-101 + PRD-246 US-03).
 * Split out from `manifest-assertions.ts` to keep each file under the
 * `max-lines: 200` cap once `frontend.captureOverlay` joined the slot.
 * Not re-exported from `@pops/types`; consumers call
 * `assertModuleManifest` instead.
 */
import { fail, isObject } from './manifest-assertions-core.js';

import type { ModuleSurface } from './module-manifest.js';

function assertOptionalNonEmptyString(value: unknown, context: string, fieldPath: string): void {
  if (value === undefined) return;
  if (typeof value !== 'string' || value.length === 0) {
    fail(context, `'${fieldPath}' must be a non-empty string when set`);
  }
}

function assertCaptureOverlay(value: unknown, context: string): void {
  if (value === undefined) return;
  if (!isObject(value)) fail(context, `'frontend.captureOverlay' must be an object when set`);
  if (typeof value.bundleSlot !== 'string' || value.bundleSlot.length === 0)
    fail(context, `'frontend.captureOverlay.bundleSlot' must be a non-empty string`);
  if (typeof value.order !== 'number' || !Number.isFinite(value.order))
    fail(context, `'frontend.captureOverlay.order' must be a finite number`);
  assertOptionalNonEmptyString(value.hotkey, context, 'frontend.captureOverlay.hotkey');
  assertOptionalNonEmptyString(value.label, context, 'frontend.captureOverlay.label');
  assertOptionalNonEmptyString(value.labelKey, context, 'frontend.captureOverlay.labelKey');
}

function assertOverlaySurface(value: Record<string, unknown>, context: string): void {
  if (!isObject(value.overlay))
    fail(context, `'frontend.overlay' is required when surfaces includes 'overlay'`);
  const o = value.overlay;
  if (typeof o.chromeSlot !== 'string')
    fail(context, `'frontend.overlay.chromeSlot' must be a string`);
  if (o.shortcut !== undefined && typeof o.shortcut !== 'string')
    fail(context, `'frontend.overlay.shortcut' must be a string when set`);
  if (o.component !== undefined && typeof o.component !== 'function')
    fail(context, `'frontend.overlay.component' must be a function when set`);
}

export function assertFrontend(
  value: unknown,
  surfaces: readonly ModuleSurface[],
  context: string
): void {
  if (value === undefined) return;
  if (!isObject(value)) fail(context, `'frontend' must be an object when set`);
  assertCaptureOverlay(value.captureOverlay, context);
  if (!surfaces.includes('overlay')) return;
  assertOverlaySurface(value, context);
}
