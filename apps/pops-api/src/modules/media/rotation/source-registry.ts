/**
 * Rotation source adapter registry.
 *
 * Maps source type strings to adapter instances. New adapters are
 * registered at startup; syncSource() looks them up at runtime.
 */
import type { RotationSourceAdapter } from './source-types.js';

const adapters = new Map<string, RotationSourceAdapter>();

export function registerSourceAdapter(adapter: RotationSourceAdapter): void {
  adapters.set(adapter.type, adapter);
}

export function getSourceAdapter(type: string): RotationSourceAdapter | undefined {
  return adapters.get(type);
}

export function getRegisteredTypes(): string[] {
  return [...adapters.keys()];
}
