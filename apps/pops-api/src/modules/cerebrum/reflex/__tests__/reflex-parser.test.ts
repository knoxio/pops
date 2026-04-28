import { describe, expect, it } from 'vitest';

import { parseReflexesToml } from '../reflex-parser.js';

const VALID_TOML = `
[[reflex]]
name = "weekly-summary"
description = "Generate a weekly knowledge summary every Sunday"
enabled = true
trigger = { type = "schedule", cron = "0 8 * * 0" }
action = { type = "emit", verb = "generate", template = "weekly-summary", scopes = ["work.*", "personal.*"] }

[[reflex]]
name = "auto-classify-captures"
description = "Classify new captures after ingestion"
enabled = true
trigger = { type = "event", event = "engram.created", conditions = { type = "capture" } }
action = { type = "ingest", verb = "classify", target = "{{engram_id}}" }

[[reflex]]
name = "consolidation-check"
description = "Propose consolidation when 10+ similar engrams exist on a topic"
enabled = true
trigger = { type = "threshold", metric = "similar_count", value = 10, scopes = ["work.*"] }
action = { type = "glia", verb = "consolidate" }

[[reflex]]
name = "daily-staleness-scan"
description = "Run the pruner daily to detect stale engrams"
enabled = false
trigger = { type = "schedule", cron = "0 6 * * *" }
action = { type = "glia", verb = "prune" }
`;

describe('parseReflexesToml', () => {
  describe('valid TOML', () => {
    it('parses all four standard reflexes', () => {
      const result = parseReflexesToml(VALID_TOML);

      expect(result.reflexes).toHaveLength(4);
      expect(result.errors.filter((e) => !e.message.includes('template variables'))).toHaveLength(
        0
      );
    });

    it('parses schedule trigger with cron expression', () => {
      const result = parseReflexesToml(VALID_TOML);
      const weekly = result.reflexes.find((r) => r.name === 'weekly-summary');

      expect(weekly).toBeDefined();
      expect(weekly!.trigger).toEqual({
        type: 'schedule',
        cron: '0 8 * * 0',
      });
      expect(weekly!.action).toEqual({
        type: 'emit',
        verb: 'generate',
        template: 'weekly-summary',
        scopes: ['work.*', 'personal.*'],
      });
    });

    it('parses event trigger with conditions', () => {
      const result = parseReflexesToml(VALID_TOML);
      const classify = result.reflexes.find((r) => r.name === 'auto-classify-captures');

      expect(classify).toBeDefined();
      expect(classify!.trigger).toEqual({
        type: 'event',
        event: 'engram.created',
        conditions: { type: 'capture' },
      });
    });

    it('parses threshold trigger with scopes', () => {
      const result = parseReflexesToml(VALID_TOML);
      const consol = result.reflexes.find((r) => r.name === 'consolidation-check');

      expect(consol).toBeDefined();
      expect(consol!.trigger).toEqual({
        type: 'threshold',
        metric: 'similar_count',
        value: 10,
        scopes: ['work.*'],
      });
    });

    it('preserves enabled=false for disabled reflexes', () => {
      const result = parseReflexesToml(VALID_TOML);
      const staleness = result.reflexes.find((r) => r.name === 'daily-staleness-scan');

      expect(staleness!.enabled).toBe(false);
    });

    it('returns empty for TOML with no [[reflex]] entries', () => {
      const result = parseReflexesToml('[defaults]\nfoo = "bar"');
      expect(result.reflexes).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('returns empty for empty TOML string', () => {
      const result = parseReflexesToml('');
      expect(result.reflexes).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('TOML syntax errors', () => {
    it('returns zero reflexes with a parse error for invalid syntax', () => {
      const result = parseReflexesToml('[[reflex]\nname = broken');
      expect(result.reflexes).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.reflexName).toBeNull();
      expect(result.errors[0]!.message).toContain('TOML parse error');
    });

    it('handles completely garbage input', () => {
      const result = parseReflexesToml('}{}{{{not toml at all');
      expect(result.reflexes).toHaveLength(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('per-reflex validation', () => {
    it('rejects a reflex with missing name', () => {
      const toml = `
[[reflex]]
description = "No name"
enabled = true
trigger = { type = "schedule", cron = "0 8 * * 0" }
action = { type = "glia", verb = "prune" }
`;
      const result = parseReflexesToml(toml);
      expect(result.reflexes).toHaveLength(0);
      expect(result.errors[0]!.message).toContain('missing required "name"');
    });

    it('rejects a reflex with missing description', () => {
      const toml = `
[[reflex]]
name = "no-desc"
enabled = true
trigger = { type = "schedule", cron = "0 8 * * 0" }
action = { type = "glia", verb = "prune" }
`;
      const result = parseReflexesToml(toml);
      expect(result.reflexes).toHaveLength(0);
      expect(result.errors[0]!.message).toContain('missing required "description"');
    });

    it('rejects a reflex with non-boolean enabled', () => {
      const toml = `
[[reflex]]
name = "bad-enabled"
description = "Bad enabled field"
enabled = "yes"
trigger = { type = "schedule", cron = "0 8 * * 0" }
action = { type = "glia", verb = "prune" }
`;
      const result = parseReflexesToml(toml);
      expect(result.reflexes).toHaveLength(0);
      expect(result.errors[0]!.message).toContain('"enabled" must be a boolean');
    });

    it('rejects duplicate reflex names — keeps first, skips second', () => {
      const toml = `
[[reflex]]
name = "same-name"
description = "First"
enabled = true
trigger = { type = "schedule", cron = "0 8 * * 0" }
action = { type = "glia", verb = "prune" }

[[reflex]]
name = "same-name"
description = "Duplicate"
enabled = true
trigger = { type = "schedule", cron = "0 8 * * 0" }
action = { type = "glia", verb = "prune" }
`;
      const result = parseReflexesToml(toml);
      expect(result.reflexes).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.message).toContain('Duplicate reflex name');
    });

    it('skips invalid reflexes but keeps valid ones', () => {
      const toml = `
[[reflex]]
name = "valid-one"
description = "Valid"
enabled = true
trigger = { type = "schedule", cron = "0 8 * * 0" }
action = { type = "glia", verb = "prune" }

[[reflex]]
name = "invalid-one"
description = "Bad trigger"
enabled = true
trigger = { type = "unknown" }
action = { type = "glia", verb = "prune" }

[[reflex]]
name = "valid-two"
description = "Another valid"
enabled = true
trigger = { type = "schedule", cron = "0 6 * * *" }
action = { type = "glia", verb = "audit" }
`;
      const result = parseReflexesToml(toml);
      expect(result.reflexes).toHaveLength(2);
      expect(result.reflexes.map((r) => r.name)).toEqual(['valid-one', 'valid-two']);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('trigger validation', () => {
    it('rejects unknown trigger type', () => {
      const toml = `
[[reflex]]
name = "bad-trigger"
description = "Unknown trigger"
enabled = true
trigger = { type = "webhook" }
action = { type = "glia", verb = "prune" }
`;
      const result = parseReflexesToml(toml);
      expect(result.reflexes).toHaveLength(0);
      expect(result.errors[0]!.message).toContain('trigger type must be one of');
    });

    it('rejects event trigger with invalid event name', () => {
      const toml = `
[[reflex]]
name = "bad-event"
description = "Bad event"
enabled = true
trigger = { type = "event", event = "engram.deleted" }
action = { type = "glia", verb = "prune" }
`;
      const result = parseReflexesToml(toml);
      expect(result.reflexes).toHaveLength(0);
      expect(result.errors[0]!.message).toContain('event trigger "event" must be one of');
    });

    it('rejects threshold trigger with invalid metric', () => {
      const toml = `
[[reflex]]
name = "bad-metric"
description = "Bad metric"
enabled = true
trigger = { type = "threshold", metric = "disk_usage", value = 90 }
action = { type = "glia", verb = "prune" }
`;
      const result = parseReflexesToml(toml);
      expect(result.reflexes).toHaveLength(0);
      expect(result.errors[0]!.message).toContain('threshold trigger "metric" must be one of');
    });

    it('rejects threshold trigger with non-positive value', () => {
      const toml = `
[[reflex]]
name = "bad-threshold"
description = "Zero threshold"
enabled = true
trigger = { type = "threshold", metric = "similar_count", value = 0 }
action = { type = "glia", verb = "prune" }
`;
      const result = parseReflexesToml(toml);
      expect(result.reflexes).toHaveLength(0);
      expect(result.errors[0]!.message).toContain('must be a positive number');
    });

    it('rejects schedule trigger with invalid cron', () => {
      const toml = `
[[reflex]]
name = "bad-cron"
description = "Invalid cron"
enabled = true
trigger = { type = "schedule", cron = "not a cron" }
action = { type = "glia", verb = "prune" }
`;
      const result = parseReflexesToml(toml);
      expect(result.reflexes).toHaveLength(0);
      expect(result.errors[0]!.message).toContain('invalid cron expression');
    });
  });

  describe('action validation', () => {
    it('rejects unknown action type', () => {
      const toml = `
[[reflex]]
name = "bad-action"
description = "Unknown action type"
enabled = true
trigger = { type = "schedule", cron = "0 8 * * 0" }
action = { type = "webhook", verb = "send" }
`;
      const result = parseReflexesToml(toml);
      expect(result.reflexes).toHaveLength(0);
      expect(result.errors[0]!.message).toContain('action type must be one of');
    });

    it('rejects unknown verb for action type', () => {
      const toml = `
[[reflex]]
name = "bad-verb"
description = "Unknown verb"
enabled = true
trigger = { type = "schedule", cron = "0 8 * * 0" }
action = { type = "glia", verb = "delete_everything" }
`;
      const result = parseReflexesToml(toml);
      expect(result.reflexes).toHaveLength(0);
      expect(result.errors[0]!.message).toContain('unknown verb');
    });

    it('rejects missing action verb', () => {
      const toml = `
[[reflex]]
name = "no-verb"
description = "Missing verb"
enabled = true
trigger = { type = "schedule", cron = "0 8 * * 0" }
action = { type = "glia" }
`;
      const result = parseReflexesToml(toml);
      expect(result.reflexes).toHaveLength(0);
      expect(result.errors[0]!.message).toContain('action "verb" is required');
    });
  });

  describe('template variable warnings', () => {
    it('warns about template variables in schedule triggers', () => {
      const toml = `
[[reflex]]
name = "sched-with-template"
description = "Schedule with template var"
enabled = true
trigger = { type = "schedule", cron = "0 8 * * 0" }
action = { type = "ingest", verb = "classify", target = "{{engram_id}}" }
`;
      const result = parseReflexesToml(toml);
      // Reflex still loads (warning, not error)
      expect(result.reflexes).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.message).toContain('template variables');
    });

    it('does not warn about template variables in event triggers', () => {
      const toml = `
[[reflex]]
name = "event-with-template"
description = "Event with template var"
enabled = true
trigger = { type = "event", event = "engram.created" }
action = { type = "ingest", verb = "classify", target = "{{engram_id}}" }
`;
      const result = parseReflexesToml(toml);
      expect(result.reflexes).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
    });
  });
});
