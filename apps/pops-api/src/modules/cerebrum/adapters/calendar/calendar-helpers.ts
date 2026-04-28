import { eventMatchesFilter, type RawCalendarEvent } from './event-parser.js';

/**
 * Calendar adapter helpers — event body building, date formatting, recurring
 * event expansion, and filter matching. Extracted from event-parser.ts and
 * calendar-adapter.ts to respect max-lines.
 */
import type { IngestFilter } from '../types.js';

/** Format an ISO 8601 datetime into a human-readable string. */
export function formatDateTime(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleString('en-AU', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  } catch {
    return iso;
  }
}

/** Format event metadata into a structured Markdown body. */
export function buildEventBody(event: RawCalendarEvent): string {
  const sections: string[] = [];

  const start = formatDateTime(event.startTime);
  const end = formatDateTime(event.endTime);
  sections.push(`**When:** ${start} — ${end}`);

  if (event.location) {
    sections.push(`**Location:** ${event.location}`);
  }
  if (event.conferenceLink) {
    sections.push(`**Join:** [Video Call](${event.conferenceLink})`);
  }
  if (event.organizer) {
    sections.push(`**Organiser:** ${event.organizer}`);
  }
  if (event.attendees && event.attendees.length > 0) {
    const attendeeList = event.attendees.map((a) => `- ${a}`).join('\n');
    sections.push(`**Attendees:**\n${attendeeList}`);
  }
  if (event.description && event.description.trim().length > 0) {
    sections.push(`---\n\n${event.description.trim()}`);
  }

  return sections.join('\n\n');
}

/**
 * Expand a recurring event into individual occurrences within a date range.
 * This is a simplified expansion — real CalDAV servers expand recurrences
 * server-side. This helper handles the case where the transport returns
 * a single event with recurrence info.
 */
export function expandRecurringEvent(
  event: RawCalendarEvent,
  start: Date,
  end: Date,
  intervalDays: number
): RawCalendarEvent[] {
  if (!event.isRecurring) return [event];

  const results: RawCalendarEvent[] = [];
  const eventStart = new Date(event.startTime);
  const eventEnd = new Date(event.endTime);
  const durationMs = eventEnd.getTime() - eventStart.getTime();

  let current = new Date(eventStart);

  while (current <= end) {
    if (current >= start) {
      const occurrenceEnd = new Date(current.getTime() + durationMs);
      const occurrenceDate = current.toISOString().slice(0, 10);

      results.push({
        ...event,
        startTime: current.toISOString(),
        endTime: occurrenceEnd.toISOString(),
        occurrenceDate,
      });
    }

    current = new Date(current.getTime() + intervalDays * 24 * 60 * 60 * 1000);
  }

  return results;
}

/** Check if a calendar event passes include/exclude filter rules. */
export function passesCalendarFilters(event: RawCalendarEvent, filters?: IngestFilter[]): boolean {
  if (!filters || filters.length === 0) return true;

  const includes = filters.filter((f) => f.type === 'include');
  const excludes = filters.filter((f) => f.type === 'exclude');

  if (includes.length > 0) {
    const included = includes.some((f) => eventMatchesFilter(event, f.field, f.pattern));
    if (!included) return false;
  }

  if (excludes.length > 0) {
    const excluded = excludes.some((f) => eventMatchesFilter(event, f.field, f.pattern));
    if (excluded) return false;
  }

  return true;
}
