import { describe, expect, it } from 'vitest';

import { buildHaBridgeManifest } from '../manifest.js';
import { mappings, type SinkMapping } from '../sinks/mapping.js';
import {
  SINK_EVENT_TYPE_REGEX,
  SinkMappingConfigError,
  validateSinkMappings,
} from '../sinks/validator.js';

function makeMapping(overrides: Partial<SinkMapping> = {}): SinkMapping {
  return {
    eventType: 'media.watch.completed',
    description: 'A test mapping description with enough characters.',
    haEventName: 'pops_media_watch_completed',
    schema: { type: 'object' },
    transformInline: (payload) => payload,
    ...overrides,
  };
}

describe('validateSinkMappings (PRD-237 US-01)', () => {
  it('accepts the shipped first-cut mappings', () => {
    expect(() => validateSinkMappings(mappings)).not.toThrow();
  });

  it('throws SinkMappingConfigError on duplicate eventType', () => {
    const config = [
      makeMapping({ eventType: 'media.watch.completed' }),
      makeMapping({ eventType: 'media.watch.completed' }),
    ];
    expect(() => validateSinkMappings(config)).toThrow(SinkMappingConfigError);
  });

  it('error message names the offending eventType for duplicates', () => {
    const config = [
      makeMapping({ eventType: 'finance.balance.low' }),
      makeMapping({ eventType: 'finance.balance.low' }),
    ];
    expect(() => validateSinkMappings(config)).toThrow(/finance\.balance\.low/);
  });

  it('throws on an eventType that violates the <source>.<entity>.<action> regex', () => {
    const config = [makeMapping({ eventType: 'Media.Watch.Completed' })];
    expect(() => validateSinkMappings(config)).toThrow(SinkMappingConfigError);
  });

  it('throws on an eventType missing a segment', () => {
    const config = [makeMapping({ eventType: 'media.completed' })];
    expect(() => validateSinkMappings(config)).toThrow(SinkMappingConfigError);
  });

  it('throws on an eventType with hyphens', () => {
    const config = [makeMapping({ eventType: 'media.watch-progress.completed' })];
    expect(() => validateSinkMappings(config)).toThrow(SinkMappingConfigError);
  });

  it('exposes a regex that matches every shipped mapping eventType', () => {
    for (const mapping of mappings) {
      expect(SINK_EVENT_TYPE_REGEX.test(mapping.eventType)).toBe(true);
    }
  });

  it('accepts an empty mappings array', () => {
    expect(() => validateSinkMappings([])).not.toThrow();
  });
});

describe('buildHaBridgeManifest sinks projection (PRD-237 US-01)', () => {
  it('projects exactly mappings.length descriptors', () => {
    const manifest = buildHaBridgeManifest('0.1.0');
    expect(manifest.sinks?.descriptors).toHaveLength(mappings.length);
  });

  it('round-trips every mapping eventType into the manifest', () => {
    const manifest = buildHaBridgeManifest('0.1.0');
    const descriptorEventTypes = manifest.sinks?.descriptors.map((d) => d.eventType) ?? [];
    for (const mapping of mappings) {
      expect(descriptorEventTypes).toContain(mapping.eventType);
    }
  });

  it('omits haEventName and transformInline from the manifest projection', () => {
    const manifest = buildHaBridgeManifest('0.1.0');
    for (const descriptor of manifest.sinks?.descriptors ?? []) {
      expect(Object.keys(descriptor).toSorted()).toEqual(['description', 'eventType', 'schema']);
    }
  });

  it('ships the three first-cut mappings from the PRD', () => {
    const eventTypes = mappings.map((m) => m.eventType);
    expect(eventTypes).toContain('media.watch.completed');
    expect(eventTypes).toContain('finance.balance.low');
    expect(eventTypes).toContain('inventory.item.consumed');
  });
});
