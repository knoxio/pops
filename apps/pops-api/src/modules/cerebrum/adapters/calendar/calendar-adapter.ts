/**
 * CalendarAdapter — CalDAV/API calendar sync adapter for Plexus (PRD-091 US-02).
 *
 * Connects to a calendar service via CalDAV or API, syncs events within
 * a configurable window, and returns EngineData[] for the ingestion pipeline.
 *
 * The actual CalDAV/API transport is abstracted behind a CalendarTransport
 * interface so the adapter logic can be fully tested without a real server.
 */
import {
  BaseAdapter,
  type AdapterConfig,
  type AdapterStatus,
  type EngineData,
  type IngestOptions,
} from '../types.js';
import { passesCalendarFilters } from './calendar-helpers.js';
import { parseCalendarEvent, type RawCalendarEvent } from './event-parser.js';

// ---------------------------------------------------------------------------
// Adapter-specific settings
// ---------------------------------------------------------------------------

export interface CalendarAdapterSettings {
  /** Connection protocol: 'caldav' or 'api'. */
  protocol: 'caldav' | 'api';
  /** CalDAV / API URL. */
  url?: string;
  /** Scope label: 'personal' or 'work'. */
  scopeLabel?: string;
  /** Days to sync into the future. Default 30. */
  syncDaysAhead?: number;
  /** Days to sync into the past. Default 7. */
  syncDaysBehind?: number;
  /** Poll interval in minutes. Default 15. */
  pollIntervalMinutes?: number;
}

// ---------------------------------------------------------------------------
// Calendar transport abstraction
// ---------------------------------------------------------------------------

/** Abstraction over the calendar transport (CalDAV, Google API, etc.). */
export interface CalendarTransport {
  /** Establish connection / authenticate. */
  connect(config: AdapterConfig<CalendarAdapterSettings>): Promise<void>;
  /** Fetch events within a date range. */
  fetchEvents(start: Date, end: Date): Promise<RawCalendarEvent[]>;
  /** List available calendars (for health check). */
  listCalendars(): Promise<string[]>;
  /** Disconnect / cleanup. */
  disconnect(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Sync state
// ---------------------------------------------------------------------------

interface CalendarSyncState {
  /** Map of externalId -> last-modified timestamp for already-ingested events. */
  ingestedEvents: Map<string, string>;
}

// ---------------------------------------------------------------------------
// CalendarAdapter
// ---------------------------------------------------------------------------

export class CalendarAdapter extends BaseAdapter<CalendarAdapterSettings> {
  readonly name = 'calendar';

  private transport: CalendarTransport | null = null;
  private syncState: CalendarSyncState = { ingestedEvents: new Map() };

  constructor(transport?: CalendarTransport) {
    super();
    this.transport = transport ?? null;
  }

  /** Set or replace the transport. */
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
    if (!this.transport) {
      throw new Error('CalendarAdapter: no transport configured');
    }

    const { start, end, scope } = this.computeSyncWindow(config.settings, options.since);
    const events = await this.transport.fetchEvents(start, end);
    const results = this.processEvents(events, scope, options);

    if (options.limit && results.length > options.limit) {
      return results.slice(0, options.limit);
    }

    return results;
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
      if (message.includes('401') || message.includes('auth')) {
        this.status = 'error';
        return {
          status: 'error',
          message: `Authentication failed: ${message}`,
          lastChecked: new Date().toISOString(),
        };
      }
      this.status = 'degraded';
      return {
        status: 'degraded',
        message: `Health check failed: ${message}`,
        lastChecked: new Date().toISOString(),
      };
    }
  }

  override async shutdown(): Promise<void> {
    if (this.transport) {
      await this.transport.disconnect();
    }
    this.syncState.ingestedEvents.clear();
    await super.shutdown();
  }

  /** Get the current sync state size (for debugging). */
  getTrackedEventCount(): number {
    return this.syncState.ingestedEvents.size;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private computeSyncWindow(
    settings: CalendarAdapterSettings,
    since?: Date
  ): { start: Date; end: Date; scope: string } {
    const daysBehind = settings.syncDaysBehind ?? 7;
    const daysAhead = settings.syncDaysAhead ?? 30;
    const scopeLabel = settings.scopeLabel ?? 'personal';
    const now = new Date();
    return {
      start: since ?? new Date(now.getTime() - daysBehind * 24 * 60 * 60 * 1000),
      end: new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000),
      scope: `${scopeLabel}.calendar`,
    };
  }

  private processEvents(
    events: RawCalendarEvent[],
    scope: string,
    options: IngestOptions
  ): EngineData[] {
    const results: EngineData[] = [];
    for (const event of events) {
      if (!passesCalendarFilters(event, options.filters)) continue;
      if (this.isAlreadyIngested(event)) continue;
      results.push(parseCalendarEvent(event, { scopeLabel: scope }));
      this.trackEvent(event);
    }
    return results;
  }

  private isAlreadyIngested(event: RawCalendarEvent): boolean {
    const externalId =
      event.isRecurring && event.occurrenceDate
        ? `${event.uid}::${event.occurrenceDate}`
        : event.uid;
    const previouslyModified = this.syncState.ingestedEvents.get(externalId);
    if (!previouslyModified || !event.lastModified) return false;
    return event.lastModified <= previouslyModified;
  }

  private trackEvent(event: RawCalendarEvent): void {
    const externalId =
      event.isRecurring && event.occurrenceDate
        ? `${event.uid}::${event.occurrenceDate}`
        : event.uid;
    this.syncState.ingestedEvents.set(externalId, event.lastModified ?? new Date().toISOString());
  }
}
