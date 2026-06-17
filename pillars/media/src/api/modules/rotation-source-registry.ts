/**
 * Rotation source adapter registry.
 *
 * Maps source type strings to adapter instances. Adapters register at module
 * load (see `rotation-register-sources.ts`); the source-sync orchestration
 * looks them up at runtime.
 */
import type { RotationSourceAdapter } from './rotation-source-types.js';

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
