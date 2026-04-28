/**
 * Tests for the CalendarAdapter and event parser (PRD-091 US-02).
 *
 * Covers:
 * - Event → EngineData parsing (title, body, custom fields)
 * - Tag extraction from event metadata
 * - Recurring event expansion
 * - Filter matching
 * - Adapter lifecycle (initialize, ingest, healthCheck, shutdown)
 * - Incremental sync (skip unmodified events)
 * - Events with no description
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CalendarAdapter,
  type CalendarAdapterSettings,
  type CalendarTransport,
} from './calendar-adapter.js';
import {
  buildEventTags,
  eventMatchesFilter,
  expandRecurringEvent,
  parseCalendarEvent,
  type RawCalendarEvent,
} from './event-parser.js';

import type { AdapterConfig, IngestFilter } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Assert array element at index exists and return it (avoids noUncheckedIndexedAccess). */
function at<T>(arr: T[], index: number): T {
  const item = arr[index];
  if (item === undefined) throw new Error(`Expected element at index ${index}`);
  return item;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<RawCalendarEvent> = {}): RawCalendarEvent {
  return {
    uid: 'event-001',
    summary: 'Sprint Planning',
    description: 'Discuss sprint goals and assign stories.',
    startTime: '2026-04-28T10:00:00Z',
    endTime: '2026-04-28T11:00:00Z',
    location: 'Room 4A',
    conferenceLink: 'https://meet.google.com/abc-defg-hij',
    attendees: ['alice@work.com', 'bob@work.com'],
    organizer: 'alice@work.com',
    isRecurring: false,
    calendarName: 'Work',
    category: 'meeting',
    lastModified: '2026-04-27T08:00:00Z',
    ...overrides,
  };
}

function makeConfig(
  overrides: Partial<CalendarAdapterSettings> = {}
): AdapterConfig<CalendarAdapterSettings> {
  return {
    name: 'calendar',
    credentials: { user: 'test@example.com', password: 'secret' },
    settings: {
      protocol: 'caldav',
      url: 'https://caldav.example.com',
      scopeLabel: 'work',
      syncDaysAhead: 30,
      syncDaysBehind: 7,
      ...overrides,
    },
  };
}

function createMockTransport(events: RawCalendarEvent[] = []): CalendarTransport {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    fetchEvents: vi.fn().mockResolvedValue(events),
    listCalendars: vi.fn().mockResolvedValue(['Work', 'Personal']),
    disconnect: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// Event parser tests
// ---------------------------------------------------------------------------

describe('parseCalendarEvent', () => {
  it('converts a basic event to EngineData', () => {
    const event = makeEvent();
    const result = parseCalendarEvent(event, { scopeLabel: 'work.calendar' });

    expect(result.title).toBe('Sprint Planning');
    expect(result.source).toBe('plexus:calendar');
    expect(result.externalId).toBe('event-001');
    expect(result.scopes).toEqual(['work.calendar']);
  });

  it('includes event metadata in body', () => {
    const event = makeEvent();
    const result = parseCalendarEvent(event, { scopeLabel: 'work.calendar' });

    expect(result.body).toContain('**Location:** Room 4A');
    expect(result.body).toContain('[Video Call]');
    expect(result.body).toContain('alice@work.com');
    expect(result.body).toContain('bob@work.com');
    expect(result.body).toContain('Discuss sprint goals');
  });

  it('includes structured custom fields for Thalamus indexing', () => {
    const event = makeEvent();
    const result = parseCalendarEvent(event, { scopeLabel: 'work.calendar' });

    expect(result.customFields).toBeDefined();
    expect(result.customFields?.['event_start']).toBe('2026-04-28T10:00:00Z');
    expect(result.customFields?.['event_end']).toBe('2026-04-28T11:00:00Z');
    expect(result.customFields?.['location']).toBe('Room 4A');
    expect(result.customFields?.['attendees']).toEqual(['alice@work.com', 'bob@work.com']);
    expect(result.customFields?.['is_recurring']).toBe(false);
  });

  it('handles events with no description', () => {
    const event = makeEvent({ description: undefined });
    const result = parseCalendarEvent(event, { scopeLabel: 'work.calendar' });

    // Body should still contain event metadata
    expect(result.body).toContain('Room 4A');
    expect(result.body).toContain('alice@work.com');
    expect(result.body).not.toContain('---');
  });

  it('handles events with no attendees', () => {
    const event = makeEvent({ attendees: undefined });
    const result = parseCalendarEvent(event, { scopeLabel: 'work.calendar' });

    expect(result.body).not.toContain('**Attendees:**');
    expect(result.customFields?.['attendees']).toEqual([]);
  });

  it('handles events with no location', () => {
    const event = makeEvent({ location: undefined });
    const result = parseCalendarEvent(event, { scopeLabel: 'work.calendar' });

    expect(result.body).not.toContain('**Location:**');
    expect(result.customFields?.['location']).toBeNull();
  });

  it('produces (untitled event) for events with no summary', () => {
    const event = makeEvent({ summary: '' });
    const result = parseCalendarEvent(event, { scopeLabel: 'work.calendar' });
    expect(result.title).toBe('(untitled event)');
  });

  it('includes occurrence date in externalId for recurring events', () => {
    const event = makeEvent({
      isRecurring: true,
      occurrenceDate: '2026-04-28',
    });
    const result = parseCalendarEvent(event, { scopeLabel: 'work.calendar' });
    expect(result.externalId).toBe('event-001::2026-04-28');
  });

  it('uses plain UID for non-recurring events', () => {
    const event = makeEvent({ isRecurring: false });
    const result = parseCalendarEvent(event, { scopeLabel: 'work.calendar' });
    expect(result.externalId).toBe('event-001');
  });
});

describe('buildEventTags', () => {
  it('extracts calendar name, category, and recurring status', () => {
    const event = makeEvent();
    const tags = buildEventTags(event);

    expect(tags).toContain('calendar:work');
    expect(tags).toContain('category:meeting');
    expect(tags).not.toContain('recurring');
  });

  it('adds recurring tag for recurring events', () => {
    const event = makeEvent({ isRecurring: true });
    const tags = buildEventTags(event);
    expect(tags).toContain('recurring');
  });

  it('adds organizer tag', () => {
    const event = makeEvent({ organizer: 'manager@company.com' });
    const tags = buildEventTags(event);
    expect(tags).toContain('organizer:manager@company.com');
  });
});

describe('eventMatchesFilter', () => {
  const event = makeEvent();

  it('matches calendar_name', () => {
    expect(eventMatchesFilter(event, 'calendar_name', 'Work')).toBe(true);
    expect(eventMatchesFilter(event, 'calendar_name', 'Personal')).toBe(false);
  });

  it('matches category', () => {
    expect(eventMatchesFilter(event, 'category', 'meeting')).toBe(true);
    expect(eventMatchesFilter(event, 'category', 'social')).toBe(false);
  });

  it('matches organizer', () => {
    expect(eventMatchesFilter(event, 'organizer', 'alice')).toBe(true);
  });

  it('matches is_recurring', () => {
    expect(eventMatchesFilter(event, 'is_recurring', 'false')).toBe(true);
    expect(eventMatchesFilter(event, 'is_recurring', 'true')).toBe(false);
  });

  it('returns false for unknown fields', () => {
    expect(eventMatchesFilter(event, 'nonexistent', '.*')).toBe(false);
  });
});

describe('expandRecurringEvent', () => {
  it('returns single event for non-recurring', () => {
    const event = makeEvent({ isRecurring: false });
    const results = expandRecurringEvent(event, new Date('2026-04-20'), new Date('2026-05-05'), 7);
    expect(results).toHaveLength(1);
  });

  it('expands a weekly recurring event within the window', () => {
    const event = makeEvent({
      isRecurring: true,
      startTime: '2026-04-21T10:00:00Z',
      endTime: '2026-04-21T11:00:00Z',
    });

    const results = expandRecurringEvent(
      event,
      new Date('2026-04-20'),
      new Date('2026-05-12'),
      7 // weekly
    );

    // Expect 3 occurrences: Apr 21, Apr 28, May 5
    expect(results).toHaveLength(3);
    expect(at(results, 0).occurrenceDate).toBe('2026-04-21');
    expect(at(results, 1).occurrenceDate).toBe('2026-04-28');
    expect(at(results, 2).occurrenceDate).toBe('2026-05-05');
  });

  it('excludes occurrences before the window start', () => {
    const event = makeEvent({
      isRecurring: true,
      startTime: '2026-04-01T10:00:00Z',
      endTime: '2026-04-01T11:00:00Z',
    });

    const results = expandRecurringEvent(event, new Date('2026-04-20'), new Date('2026-05-05'), 7);

    // Event starts April 1, weekly: Apr 1, 8, 15, 22, 29, May 6
    // Window is Apr 20 - May 5, so Apr 22 and Apr 29
    expect(results.every((r) => new Date(r.startTime) >= new Date('2026-04-20'))).toBe(true);
  });

  it('preserves event duration in expanded occurrences', () => {
    const event = makeEvent({
      isRecurring: true,
      startTime: '2026-04-21T10:00:00Z',
      endTime: '2026-04-21T11:30:00Z', // 90 minutes
    });

    const results = expandRecurringEvent(event, new Date('2026-04-20'), new Date('2026-04-25'), 7);

    expect(results).toHaveLength(1);
    const first = at(results, 0);
    const durationMs = new Date(first.endTime).getTime() - new Date(first.startTime).getTime();
    expect(durationMs).toBe(90 * 60 * 1000);
  });
});

// ---------------------------------------------------------------------------
// CalendarAdapter tests
// ---------------------------------------------------------------------------

describe('CalendarAdapter', () => {
  let adapter: CalendarAdapter;
  let transport: CalendarTransport;

  beforeEach(() => {
    transport = createMockTransport([makeEvent()]);
    adapter = new CalendarAdapter(transport);
  });

  describe('initialize', () => {
    it('connects transport and transitions to healthy', async () => {
      await adapter.initialize(makeConfig());

      expect(transport.connect).toHaveBeenCalledTimes(1);
      const status = await adapter.healthCheck();
      expect(status.status).toBe('healthy');
    });

    it('throws and sets error status when transport fails to connect', async () => {
      vi.mocked(transport.connect).mockRejectedValue(new Error('CalDAV 401'));

      await expect(adapter.initialize(makeConfig())).rejects.toThrow('failed to connect');
    });

    it('throws when no transport is configured', async () => {
      const noTransport = new CalendarAdapter();
      await expect(noTransport.initialize(makeConfig())).rejects.toThrow('no transport configured');
    });
  });

  describe('ingest', () => {
    it('fetches events and returns EngineData', async () => {
      await adapter.initialize(makeConfig());

      const results = await adapter.ingest({});
      expect(results).toHaveLength(1);
      expect(at(results, 0).source).toBe('plexus:calendar');
      expect(at(results, 0).title).toBe('Sprint Planning');
    });

    it('uses correct scope from config', async () => {
      await adapter.initialize(makeConfig({ scopeLabel: 'personal' }));

      const results = await adapter.ingest({});
      expect(at(results, 0).scopes).toEqual(['personal.calendar']);
    });

    it('applies exclude filters', async () => {
      const event1 = makeEvent({ calendarName: 'Work' });
      const event2 = makeEvent({ calendarName: 'Social', uid: 'event-002' });

      const filteredTransport = createMockTransport([event1, event2]);
      const filteredAdapter = new CalendarAdapter(filteredTransport);
      await filteredAdapter.initialize(makeConfig());

      const filters: IngestFilter[] = [
        { field: 'calendar_name', pattern: 'Social', type: 'exclude' },
      ];

      const results = await filteredAdapter.ingest({ filters });
      expect(results).toHaveLength(1);
      expect(at(results, 0).customFields?.['calendar_name']).toBe('Work');
    });

    it('skips already-ingested events that have not been modified', async () => {
      const event = makeEvent({ lastModified: '2026-04-27T08:00:00Z' });
      const ingestTransport = createMockTransport([event]);

      const ingestAdapter = new CalendarAdapter(ingestTransport);
      await ingestAdapter.initialize(makeConfig());

      // First ingest — should return the event
      const first = await ingestAdapter.ingest({});
      expect(first).toHaveLength(1);

      // Second ingest — same event, same lastModified, should be skipped
      const second = await ingestAdapter.ingest({});
      expect(second).toHaveLength(0);
    });

    it('re-ingests events that have been modified since last sync', async () => {
      const event = makeEvent({ lastModified: '2026-04-27T08:00:00Z' });
      const updatedEvent = makeEvent({ lastModified: '2026-04-28T12:00:00Z' });

      const modTransport = createMockTransport([event]);
      const modAdapter = new CalendarAdapter(modTransport);
      await modAdapter.initialize(makeConfig());

      // First ingest
      await modAdapter.ingest({});

      // Return updated event on second call
      vi.mocked(modTransport.fetchEvents).mockResolvedValueOnce([updatedEvent]);

      const results = await modAdapter.ingest({});
      expect(results).toHaveLength(1);
    });

    it('respects limit option', async () => {
      const events = [makeEvent({ uid: '1' }), makeEvent({ uid: '2' }), makeEvent({ uid: '3' })];

      const limitTransport = createMockTransport(events);
      const limitAdapter = new CalendarAdapter(limitTransport);
      await limitAdapter.initialize(makeConfig());

      const results = await limitAdapter.ingest({ limit: 2 });
      expect(results).toHaveLength(2);
    });
  });

  describe('healthCheck', () => {
    it('returns healthy with calendar count', async () => {
      await adapter.initialize(makeConfig());
      const status = await adapter.healthCheck();

      expect(status.status).toBe('healthy');
      expect(status.message).toContain('2 calendar(s)');
      expect(status.metrics?.['calendars']).toEqual(['Work', 'Personal']);
    });

    it('returns error on auth failure', async () => {
      vi.mocked(transport.listCalendars).mockRejectedValue(new Error('401 Unauthorized'));
      await adapter.initialize(makeConfig());

      const status = await adapter.healthCheck();
      expect(status.status).toBe('error');
      expect(status.message).toContain('Authentication failed');
    });

    it('returns degraded on transient failure', async () => {
      vi.mocked(transport.listCalendars).mockRejectedValue(new Error('Connection timeout'));
      await adapter.initialize(makeConfig());

      const status = await adapter.healthCheck();
      expect(status.status).toBe('degraded');
    });

    it('returns error when no transport configured', async () => {
      const noTransport = new CalendarAdapter();
      const status = await noTransport.healthCheck();
      expect(status.status).toBe('error');
    });
  });

  describe('shutdown', () => {
    it('disconnects transport and clears tracked events', async () => {
      await adapter.initialize(makeConfig());
      await adapter.ingest({});

      expect(adapter.getTrackedEventCount()).toBeGreaterThan(0);

      await adapter.shutdown();

      expect(transport.disconnect).toHaveBeenCalledTimes(1);
      expect(adapter.getTrackedEventCount()).toBe(0);
    });
  });
});
