import { buildEventBody, type RawCalendarEvent } from './calendar-helpers.js';

/**
 * Calendar event parser — converts raw calendar event data into EngineData.
 *
 * Handles event metadata extraction, tag building, and date field indexing.
 */
import type { EngineData } from '../types.js';

// Re-export helpers and types for external consumers.
export type { RawCalendarEvent } from './calendar-helpers.js';
export { buildEventBody, expandRecurringEvent, formatDateTime } from './calendar-helpers.js';

/** Build tags from event metadata. */
export function buildEventTags(event: RawCalendarEvent): string[] {
  const tags: string[] = [];
  if (event.calendarName) tags.push(`calendar:${event.calendarName.toLowerCase()}`);
  if (event.category) tags.push(`category:${event.category.toLowerCase()}`);
  if (event.isRecurring) tags.push('recurring');
  if (event.organizer) tags.push(`organizer:${event.organizer.toLowerCase()}`);
  return tags;
}

export interface CalendarParserOptions {
  scopeLabel: string;
}

/** Convert a raw calendar event into EngineData for the ingestion pipeline. */
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
