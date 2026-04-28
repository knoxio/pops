import { describe, expect, it } from 'vitest';

import {
  getNextFireTime,
  isValidCron,
  scheduledJobName,
  scheduledJobId,
} from '../triggers/scheduled-trigger.js';

import type { ReflexDefinition } from '../types.js';

function makeScheduledReflex(cron = '0 8 * * 0'): ReflexDefinition {
  return {
    name: 'scheduled-test',
    description: 'Test scheduled',
    enabled: true,
    trigger: { type: 'schedule', cron },
    action: { type: 'glia', verb: 'prune' },
  };
}

describe('getNextFireTime', () => {
  it('returns an ISO 8601 date string for a valid cron', () => {
    const reflex = makeScheduledReflex('0 8 * * *');
    const result = getNextFireTime(reflex);

    expect(result).not.toBeNull();
    // Should be a valid date
    expect(new Date(result!).toISOString()).toBe(result);
  });

  it('returns null for non-schedule triggers', () => {
    const reflex: ReflexDefinition = {
      name: 'event-reflex',
      description: 'Event trigger',
      enabled: true,
      trigger: { type: 'event', event: 'engram.created' },
      action: { type: 'ingest', verb: 'classify' },
    };

    expect(getNextFireTime(reflex)).toBeNull();
  });

  it('returns null for invalid cron (should not happen after parsing)', () => {
    // Force an invalid state to test the error path.
    const reflex: ReflexDefinition = {
      name: 'bad-cron',
      description: 'Bad cron',
      enabled: true,
      trigger: { type: 'schedule', cron: 'not valid' },
      action: { type: 'glia', verb: 'prune' },
    };

    expect(getNextFireTime(reflex)).toBeNull();
  });

  it('next fire time is in the future', () => {
    const reflex = makeScheduledReflex('* * * * *'); // Every minute.
    const result = getNextFireTime(reflex);

    expect(result).not.toBeNull();
    expect(new Date(result!).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });
});

describe('isValidCron', () => {
  it('accepts standard 5-field cron expressions', () => {
    expect(isValidCron('0 8 * * 0')).toBe(true);
    expect(isValidCron('0 6 * * *')).toBe(true);
    expect(isValidCron('*/5 * * * *')).toBe(true);
    expect(isValidCron('0 0 1 * *')).toBe(true);
  });

  it('rejects invalid cron expressions', () => {
    expect(isValidCron('not a cron')).toBe(false);
    expect(isValidCron('60 * * * *')).toBe(false);
    expect(isValidCron('')).toBe(false);
  });
});

describe('scheduledJobName', () => {
  it('returns a prefixed job name', () => {
    expect(scheduledJobName('weekly-summary')).toBe('reflex:scheduled:weekly-summary');
  });
});

describe('scheduledJobId', () => {
  it('returns a prefixed job ID', () => {
    expect(scheduledJobId('weekly-summary')).toBe('reflex-sched-weekly-summary');
  });
});
