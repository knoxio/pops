/**
 * Calendar adapter helpers — event body building, date formatting, and
 * recurring event expansion. Extracted from event-parser.ts and
 * calendar-adapter.ts to respect max-lines.
 *
 * This file is a leaf dependency — no imports from sibling files.
 * The RawCalendarEvent interface is defined here and re-exported by
 * event-parser.ts to avoid circular dependencies.
 */

/** Raw calendar event data from CalDAV or API. */
export interface RawCalendarEvent {
  uid: string;
  summary: string;
  description?: string;
  startTime: string;
  endTime: string;
  location?: string;
  conferenceLink?: string;
  attendees?: string[];
  organizer?: string;
  isRecurring: boolean;
  occurrenceDate?: string;
  calendarName?: string;
  category?: string;
  lastModified?: string;
}

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
  if (event.location) sections.push(`**Location:** ${event.location}`);
  if (event.conferenceLink) sections.push(`**Join:** [Video Call](${event.conferenceLink})`);
  if (event.organizer) sections.push(`**Organiser:** ${event.organizer}`);
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
 * Simplified expansion — real CalDAV servers expand recurrences server-side.
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
      results.push({
        ...event,
        startTime: current.toISOString(),
        endTime: occurrenceEnd.toISOString(),
        occurrenceDate: current.toISOString().slice(0, 10),
      });
    }
    current = new Date(current.getTime() + intervalDays * 24 * 60 * 60 * 1000);
  }
  return results;
}
