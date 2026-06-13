/**
 * PRD-237 US-01: Boot-time validator for the sink mapping config.
 *
 * Fails fast (throws) on:
 *   - duplicate `eventType` entries — two mappings cannot claim the same POPS
 *     event in the same bridge.
 *   - `eventType` strings that do not match the `<source>.<entity>.<action>`
 *     convention defined by PRD-236 US-01.
 *
 * Called from `manifest.ts` at module load so an invalid config crashes the
 * pillar before it can register a broken manifest.
 */

import type { SinkMapping } from './mapping.js';

export const SINK_EVENT_TYPE_REGEX = /^[a-z][a-z0-9]*\.[a-z][a-z0-9]*\.[a-z][a-z0-9]*$/;

export class SinkMappingConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SinkMappingConfigError';
  }
}

export function validateSinkMappings(mappings: readonly SinkMapping[]): void {
  const seen = new Set<string>();
  const duplicates: string[] = [];

  for (const mapping of mappings) {
    if (!SINK_EVENT_TYPE_REGEX.test(mapping.eventType)) {
      throw new SinkMappingConfigError(
        `Invalid sink mapping eventType '${mapping.eventType}': must match <source>.<entity>.<action> (lowercase dotted).`
      );
    }
    if (seen.has(mapping.eventType)) {
      duplicates.push(mapping.eventType);
    } else {
      seen.add(mapping.eventType);
    }
  }

  if (duplicates.length > 0) {
    const unique = Array.from(new Set(duplicates));
    throw new SinkMappingConfigError(
      `Duplicate sink mapping eventType(s): ${unique.join(', ')}. Each POPS eventType may have at most one mapping per bridge.`
    );
  }
}
