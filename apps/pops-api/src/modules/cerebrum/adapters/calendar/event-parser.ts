import { buildEventBody } from './calendar-helpers.js';

/**
 * Calendar event parser — converts raw calendar event data into EngineData.
 *
 * Handles event metadata extraction, recurring event expansion,
 * attendee formatting, and date field indexing.
 */
import type { EngineData } from '../types.js';

// Re-export helpers that external consumers might need.
export { buildEventBody, expandRecurringEvent, formatDateTime } from './calendar-helpers.js';

// ---------------------------------------------------------------------------
// Raw event types (from CalDAV or API)
// ---------------------------------------------------------------------------

export interface RawCalendarEvent {
  /** Calendar event UID (used as externalId base). */
  uid: string;
  /** Event title / summary. */
  summary: string;
  /** Event description (may be empty). */
  description?: string;
  /** Event start time (ISO 8601). */
  startTime: string;
  /** Event end time (ISO 8601). */
  endTime: string;
  /** Event location. */
  location?: string;
  /** Video/conference call link. */
  conferenceLink?: string;
  /** Attendee list (name or email). */
  attendees?: string[];
  /** Organiser name or email. */
  organizer?: string;
  /** Whether this is a recurring event. */
  isRecurring: boolean;
  /** The specific occurrence date for recurring events (ISO 8601 date). */
  occurrenceDate?: string;
  /** Calendar name (e.g. 'Work', 'Personal'). */
  calendarName?: string;
  /** Event category / tag. */
  category?: string;
  /** ISO 8601 timestamp of last modification. */
  lastModified?: string;
}

// ---------------------------------------------------------------------------
// Tag extraction
// ---------------------------------------------------------------------------

/** Build tags from event metadata. */
export function buildEventTags(event: RawCalendarEvent): string[] {
  const tags: string[] = [];

  if (event.calendarName) {
    tags.push(`calendar:${event.calendarName.toLowerCase()}`);
  }
  if (event.category) {
    tags.push(`category:${event.category.toLowerCase()}`);
  }
  if (event.isRecurring) {
    tags.push('recurring');
  }
  if (event.organizer) {
    tags.push(`organizer:${event.organizer.toLowerCase()}`);
  }

  return tags;
}

// ---------------------------------------------------------------------------
// Event -> EngineData conversion
// ---------------------------------------------------------------------------

export interface CalendarParserOptions {
  /** Default scope label (e.g. 'personal.calendar' or 'work.calendar'). */
  scopeLabel: string;
}

/**
 * Convert a raw calendar event into EngineData for the ingestion pipeline.
 * For recurring events, the externalId includes the occurrence date.
 */
export function parseCalendarEvent(
  event: RawCalendarEvent,
  options: CalendarParserOptions
): EngineData {
  const externalId =
    event.isRecurring && event.occurrenceDate ? `${event.uid}::${event.occurrenceDate}` : event.uid;

  return {
    title: event.summary || '(untitled event)',
    body: buildEventBody(event),
    source: 'plexus:calendar',
    externalId,
    tags: buildEventTags(event),
    scopes: [options.scopeLabel],
    customFields: {
      event_start: event.startTime,
      event_end: event.endTime,
      location: event.location ?? null,
      attendees: event.attendees ?? [],
      is_recurring: event.isRecurring,
      calendar_name: event.calendarName ?? null,
      organizer: event.organizer ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// Filter helpers
// ---------------------------------------------------------------------------

/** Check if a calendar event matches a filter pattern on a given field. */
export function eventMatchesFilter(
  event: RawCalendarEvent,
  field: string,
  pattern: string
): boolean {
  const regex = new RegExp(pattern, 'i');

  switch (field) {
    case 'calendar_name':
      return regex.test(event.calendarName ?? '');
    case 'category':
      return regex.test(event.category ?? '');
    case 'organizer':
      return regex.test(event.organizer ?? '');
    case 'is_recurring':
      return String(event.isRecurring) === pattern;
    default:
      return false;
  }
}
