/**
 * CalendarAdapter — CalDAV/API calendar sync adapter for Plexus (PRD-091 US-02).
 *
 * Connects to a calendar service via CalDAV or API, syncs events within a
 * configurable window, and returns EngineData[]. The CalDAV/API transport is
 * abstracted behind a CalendarTransport interface for testability.
 */
import {
  BaseAdapter,
  type AdapterConfig,
  type AdapterStatus,
  type EngineData,
  type IngestFilter,
  type IngestOptions,
} from '../types.js';
import { eventMatchesFilter, parseCalendarEvent, type RawCalendarEvent } from './event-parser.js';

export interface CalendarAdapterSettings {
  protocol: 'caldav' | 'api';
  url?: string;
  scopeLabel?: string;
  syncDaysAhead?: number;
  syncDaysBehind?: number;
  pollIntervalMinutes?: number;
}

/** Abstraction over the calendar transport (CalDAV, Google API, etc.). */
export interface CalendarTransport {
  connect(config: AdapterConfig<CalendarAdapterSettings>): Promise<void>;
  fetchEvents(start: Date, end: Date): Promise<RawCalendarEvent[]>;
  listCalendars(): Promise<string[]>;
  disconnect(): Promise<void>;
}

interface CalendarSyncState {
  ingestedEvents: Map<string, string>;
}

function eventExternalId(event: RawCalendarEvent): string {
  return event.isRecurring && event.occurrenceDate
    ? `${event.uid}::${event.occurrenceDate}`
    : event.uid;
}

export class CalendarAdapter extends BaseAdapter<CalendarAdapterSettings> {
  readonly name = 'calendar';
  private transport: CalendarTransport | null = null;
  private syncState: CalendarSyncState = { ingestedEvents: new Map() };

  constructor(transport?: CalendarTransport) {
    super();
    this.transport = transport ?? null;
  }

  setTransport(transport: CalendarTransport): void {
    this.transport = transport;
  }

  override async initialize(config: AdapterConfig<CalendarAdapterSettings>): Promise<void> {
    await super.initialize(config);
    if (!this.transport) {
      throw new Error(
        'CalendarAdapter: no transport configured. Provide a CalendarTransport ' +
          'implementation via the constructor or setTransport().'
      );
    }
    try {
      await this.transport.connect(config);
      this.status = 'healthy';
    } catch (err) {
      this.status = 'error';
      throw new Error(
        `CalendarAdapter: failed to connect — ${err instanceof Error ? err.message : String(err)}`,
        { cause: err }
      );
    }
  }

  override async ingest(options: IngestOptions): Promise<EngineData[]> {
    const config = this.requireConfig();
    if (!this.transport) throw new Error('CalendarAdapter: no transport configured');
    const { start, end, scope } = this.computeSyncWindow(config.settings, options.since);
    const events = await this.transport.fetchEvents(start, end);
    const results = this.processEvents(events, scope, options);
    return options.limit && results.length > options.limit
      ? results.slice(0, options.limit)
      : results;
  }

  override async healthCheck(): Promise<AdapterStatus> {
    if (!this.transport) {
      return {
        status: 'error',
        message: 'No transport configured',
        lastChecked: new Date().toISOString(),
      };
    }
    try {
      const calendars = await this.transport.listCalendars();
      this.status = 'healthy';
      return {
        status: 'healthy',
        message: `Connected — ${calendars.length} calendar(s) accessible`,
        lastChecked: new Date().toISOString(),
        metrics: { calendars, trackedEvents: this.syncState.ingestedEvents.size },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isAuth = message.includes('401') || message.includes('auth');
      this.status = isAuth ? 'error' : 'degraded';
      return {
        status: this.status,
        message: isAuth ? `Authentication failed: ${message}` : `Health check failed: ${message}`,
        lastChecked: new Date().toISOString(),
      };
    }
  }

  override async shutdown(): Promise<void> {
    if (this.transport) await this.transport.disconnect();
    this.syncState.ingestedEvents.clear();
    await super.shutdown();
  }

  getTrackedEventCount(): number {
    return this.syncState.ingestedEvents.size;
  }

  private computeSyncWindow(
    settings: CalendarAdapterSettings,
    since?: Date
  ): { start: Date; end: Date; scope: string } {
    const now = new Date();
    return {
      start: since ?? new Date(now.getTime() - (settings.syncDaysBehind ?? 7) * 86400000),
      end: new Date(now.getTime() + (settings.syncDaysAhead ?? 30) * 86400000),
      scope: `${settings.scopeLabel ?? 'personal'}.calendar`,
    };
  }

  private processEvents(
    events: RawCalendarEvent[],
    scope: string,
    options: IngestOptions
  ): EngineData[] {
    const results: EngineData[] = [];
    for (const event of events) {
      if (!this.passesFilters(event, options.filters)) continue;
      if (this.isAlreadyIngested(event)) continue;
      results.push(parseCalendarEvent(event, { scopeLabel: scope }));
      this.syncState.ingestedEvents.set(
        eventExternalId(event),
        event.lastModified ?? new Date().toISOString()
      );
    }
    return results;
  }

  private isAlreadyIngested(event: RawCalendarEvent): boolean {
    const prev = this.syncState.ingestedEvents.get(eventExternalId(event));
    if (!prev || !event.lastModified) return false;
    return event.lastModified <= prev;
  }

  private passesFilters(event: RawCalendarEvent, filters?: IngestFilter[]): boolean {
    if (!filters || filters.length === 0) return true;
    const includes = filters.filter((f) => f.type === 'include');
    const excludes = filters.filter((f) => f.type === 'exclude');
    if (includes.length > 0) {
      if (!includes.some((f) => eventMatchesFilter(event, f.field, f.pattern))) return false;
    }
    if (excludes.some((f) => eventMatchesFilter(event, f.field, f.pattern))) return false;
    return true;
  }
}
