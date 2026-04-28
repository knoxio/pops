/**
 * Calendar event parser — converts raw calendar event data into EngineData.
 *
 * Handles event metadata extraction, recurring event expansion,
 * attendee formatting, and date field indexing.
 */
import type { EngineData } from '../types.js';

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
// Body construction
// ---------------------------------------------------------------------------

/** Format event metadata into a structured Markdown body. */
function buildEventBody(event: RawCalendarEvent): string {
  const sections: string[] = [];

  // Time section
  const start = formatDateTime(event.startTime);
  const end = formatDateTime(event.endTime);
  sections.push(`**When:** ${start} — ${end}`);

  // Location
  if (event.location) {
    sections.push(`**Location:** ${event.location}`);
  }

  // Conference link
  if (event.conferenceLink) {
    sections.push(`**Join:** [Video Call](${event.conferenceLink})`);
  }

  // Organiser
  if (event.organizer) {
    sections.push(`**Organiser:** ${event.organizer}`);
  }

  // Attendees
  if (event.attendees && event.attendees.length > 0) {
    const attendeeList = event.attendees.map((a) => `- ${a}`).join('\n');
    sections.push(`**Attendees:**\n${attendeeList}`);
  }

  // Description
  if (event.description && event.description.trim().length > 0) {
    sections.push(`---\n\n${event.description.trim()}`);
  }

  return sections.join('\n\n');
}

/** Format an ISO 8601 datetime into a human-readable string. */
function formatDateTime(iso: string): string {
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
// Event → EngineData conversion
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
  // For recurring events, include occurrence date in externalId to prevent
  // deduplication across different occurrences of the same event.
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

/**
 * Check if a calendar event matches a filter pattern on a given field.
 */
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

// ---------------------------------------------------------------------------
// Recurring event expansion
// ---------------------------------------------------------------------------

/**
 * Expand a recurring event into individual occurrences within a date range.
 * This is a simplified expansion — real CalDAV servers expand recurrences
 * server-side. This helper handles the case where the transport returns
 * a single event with recurrence info.
 *
 * @param event  The recurring event template
 * @param start  Window start date
 * @param end    Window end date
 * @param intervalDays  Recurrence interval in days (simplified)
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

  // Walk forward from event start, generating occurrences within the window
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
