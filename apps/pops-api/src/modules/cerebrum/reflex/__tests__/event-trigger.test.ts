import { describe, expect, it } from 'vitest';

import { matchesEventTrigger, resolveTemplateVariables } from '../triggers/event-trigger.js';

import type { EngramEventPayload, ReflexDefinition } from '../types.js';

function makeReflex(overrides?: Partial<ReflexDefinition>): ReflexDefinition {
  return {
    name: 'test-reflex',
    description: 'Test reflex',
    enabled: true,
    trigger: {
      type: 'event',
      event: 'engram.created',
    },
    action: { type: 'ingest', verb: 'classify' },
    ...overrides,
  };
}

function makePayload(overrides?: Partial<EngramEventPayload>): EngramEventPayload {
  return {
    event: 'engram.created',
    engramId: 'eng_123',
    engramType: 'capture',
    scopes: ['work.projects'],
    source: 'manual',
    ...overrides,
  };
}

describe('matchesEventTrigger', () => {
  it('matches when event type matches and no conditions', () => {
    const reflex = makeReflex();
    const payload = makePayload();

    expect(matchesEventTrigger(reflex, payload)).toBe(true);
  });

  it('does not match when event type differs', () => {
    const reflex = makeReflex();
    const payload = makePayload({ event: 'engram.archived' });

    expect(matchesEventTrigger(reflex, payload)).toBe(false);
  });

  it('does not match disabled reflexes', () => {
    const reflex = makeReflex({ enabled: false });
    const payload = makePayload();

    expect(matchesEventTrigger(reflex, payload)).toBe(false);
  });

  it('does not match non-event triggers', () => {
    const reflex = makeReflex({
      trigger: { type: 'schedule', cron: '0 8 * * 0' },
    });
    const payload = makePayload();

    expect(matchesEventTrigger(reflex, payload)).toBe(false);
  });

  describe('conditions filtering', () => {
    it('matches when type condition matches', () => {
      const reflex = makeReflex({
        trigger: {
          type: 'event',
          event: 'engram.created',
          conditions: { type: 'capture' },
        },
      });
      const payload = makePayload({ engramType: 'capture' });

      expect(matchesEventTrigger(reflex, payload)).toBe(true);
    });

    it('does not match when type condition differs', () => {
      const reflex = makeReflex({
        trigger: {
          type: 'event',
          event: 'engram.created',
          conditions: { type: 'capture' },
        },
      });
      const payload = makePayload({ engramType: 'note' });

      expect(matchesEventTrigger(reflex, payload)).toBe(false);
    });

    it('matches when source condition matches', () => {
      const reflex = makeReflex({
        trigger: {
          type: 'event',
          event: 'engram.created',
          conditions: { source: 'manual' },
        },
      });
      const payload = makePayload({ source: 'manual' });

      expect(matchesEventTrigger(reflex, payload)).toBe(true);
    });

    it('does not match when source condition differs', () => {
      const reflex = makeReflex({
        trigger: {
          type: 'event',
          event: 'engram.created',
          conditions: { source: 'api' },
        },
      });
      const payload = makePayload({ source: 'manual' });

      expect(matchesEventTrigger(reflex, payload)).toBe(false);
    });

    it('matches scope prefix pattern (work.* matches work.projects)', () => {
      const reflex = makeReflex({
        trigger: {
          type: 'event',
          event: 'engram.created',
          conditions: { scopes: ['work.*'] },
        },
      });
      const payload = makePayload({ scopes: ['work.projects'] });

      expect(matchesEventTrigger(reflex, payload)).toBe(true);
    });

    it('matches exact scope (no wildcard)', () => {
      const reflex = makeReflex({
        trigger: {
          type: 'event',
          event: 'engram.created',
          conditions: { scopes: ['personal'] },
        },
      });
      const payload = makePayload({ scopes: ['personal'] });

      expect(matchesEventTrigger(reflex, payload)).toBe(true);
    });

    it('does not match when no scopes overlap', () => {
      const reflex = makeReflex({
        trigger: {
          type: 'event',
          event: 'engram.created',
          conditions: { scopes: ['work.*'] },
        },
      });
      const payload = makePayload({ scopes: ['personal.journal'] });

      expect(matchesEventTrigger(reflex, payload)).toBe(false);
    });

    it('matches when multiple conditions all satisfied', () => {
      const reflex = makeReflex({
        trigger: {
          type: 'event',
          event: 'engram.created',
          conditions: { type: 'capture', source: 'manual', scopes: ['work.*'] },
        },
      });
      const payload = makePayload({
        engramType: 'capture',
        source: 'manual',
        scopes: ['work.projects'],
      });

      expect(matchesEventTrigger(reflex, payload)).toBe(true);
    });

    it('does not match when one of multiple conditions fails', () => {
      const reflex = makeReflex({
        trigger: {
          type: 'event',
          event: 'engram.created',
          conditions: { type: 'capture', source: 'api' },
        },
      });
      const payload = makePayload({ engramType: 'capture', source: 'manual' });

      expect(matchesEventTrigger(reflex, payload)).toBe(false);
    });

    it('scope prefix work.* matches exact scope "work" too', () => {
      const reflex = makeReflex({
        trigger: {
          type: 'event',
          event: 'engram.created',
          conditions: { scopes: ['work.*'] },
        },
      });
      const payload = makePayload({ scopes: ['work'] });

      expect(matchesEventTrigger(reflex, payload)).toBe(true);
    });
  });
});

describe('resolveTemplateVariables', () => {
  const payload = makePayload({
    engramId: 'eng_abc',
    engramType: 'capture',
    scopes: ['work.projects', 'work.ai'],
  });

  it('resolves {{engram_id}}', () => {
    expect(resolveTemplateVariables('{{engram_id}}', payload)).toBe('eng_abc');
  });

  it('resolves {{engram_type}}', () => {
    expect(resolveTemplateVariables('{{engram_type}}', payload)).toBe('capture');
  });

  it('resolves {{engram_scopes}} as comma-separated', () => {
    expect(resolveTemplateVariables('{{engram_scopes}}', payload)).toBe('work.projects,work.ai');
  });

  it('resolves multiple variables in one string', () => {
    const template = 'process {{engram_id}} of type {{engram_type}}';
    expect(resolveTemplateVariables(template, payload)).toBe('process eng_abc of type capture');
  });

  it('leaves unknown variables as-is', () => {
    expect(resolveTemplateVariables('{{unknown}}', payload)).toBe('{{unknown}}');
  });
});
