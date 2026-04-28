/**
 * EmailAdapter — IMAP/API email ingestion adapter for Plexus (PRD-091 US-01).
 *
 * Connects to an email account via IMAP or API, fetches new messages from
 * configured folders, applies filtering rules, and returns EngineData[] for
 * the ingestion pipeline. The IMAP/API transport is abstracted behind an
 * EmailTransport interface for testability.
 */
import {
  BaseAdapter,
  type AdapterConfig,
  type AdapterStatus,
  type EmitContent,
  type EmitOptions,
  type EngineData,
  type IngestFilter,
  type IngestOptions,
} from '../types.js';
import { markdownToSimpleHtml } from './email-helpers.js';
import { emailMatchesFilter, parseEmail, type RawEmail } from './email-parser.js';

export interface EmailAdapterSettings {
  protocol: 'imap' | 'api';
  host?: string;
  port?: number;
  tls?: boolean;
  folders?: string[];
  scopeLabel?: string;
  pollIntervalMinutes?: number;
}

/** Abstraction over the email transport (IMAP, API, etc.). */
export interface EmailTransport {
  connect(config: AdapterConfig<EmailAdapterSettings>): Promise<void>;
  fetchEmails(folder: string, since?: Date, limit?: number): Promise<RawEmail[]>;
  ping(): Promise<boolean>;
  sendEmail?(to: string[], subject: string, htmlBody: string): Promise<void>;
  disconnect(): Promise<void>;
}

interface FolderSyncState {
  lastSynced: string;
}

export class EmailAdapter extends BaseAdapter<EmailAdapterSettings> {
  readonly name = 'email';
  private transport: EmailTransport | null = null;
  private syncState = new Map<string, FolderSyncState>();

  constructor(transport?: EmailTransport) {
    super();
    this.transport = transport ?? null;
  }

  setTransport(transport: EmailTransport): void {
    this.transport = transport;
  }

  override async initialize(config: AdapterConfig<EmailAdapterSettings>): Promise<void> {
    await super.initialize(config);
    if (!this.transport) {
      throw new Error(
        'EmailAdapter: no transport configured. Provide an EmailTransport implementation ' +
          '(e.g. IMAP transport) via the constructor or setTransport().'
      );
    }
    try {
      await this.transport.connect(config);
      this.status = 'healthy';
    } catch (err) {
      this.status = 'error';
      throw new Error(
        `EmailAdapter: failed to connect — ${err instanceof Error ? err.message : String(err)}`,
        { cause: err }
      );
    }
  }

  override async ingest(options: IngestOptions): Promise<EngineData[]> {
    const config = this.requireConfig();
    if (!this.transport) throw new Error('EmailAdapter: no transport configured');

    const folders = config.settings.folders ?? ['INBOX'];
    const scope = `${config.settings.scopeLabel ?? 'personal'}.email`;
    const allResults: EngineData[] = [];

    for (const folder of folders) {
      const folderState = this.syncState.get(folder);
      const since = options.since ?? (folderState ? new Date(folderState.lastSynced) : undefined);
      const emails = await this.transport.fetchEmails(folder, since, options.limit);

      for (const email of emails) {
        if (!this.passesFilters(email, options.filters)) continue;
        allResults.push(parseEmail(email, { scopeLabel: scope }));
      }

      if (emails.length > 0) {
        const latestDate = emails.reduce((latest, e) => {
          const d = new Date(e.date);
          return d > latest ? d : latest;
        }, new Date(0));
        this.syncState.set(folder, { lastSynced: latestDate.toISOString() });
      }
    }
    return allResults;
  }

  override async healthCheck(): Promise<AdapterStatus> {
    if (!this.transport) {
      return {
        status: 'error',
        message: 'No transport configured',
        lastChecked: new Date().toISOString(),
      };
    }
    if (this.status === 'error') {
      return {
        status: 'error',
        message: 'Adapter is in error state — re-initialise to recover',
        lastChecked: new Date().toISOString(),
      };
    }
    try {
      const alive = await this.transport.ping();
      this.status = alive ? 'healthy' : 'degraded';
      return {
        status: this.status,
        message: alive ? 'Connection alive' : 'Ping failed — connection may be stale',
        lastChecked: new Date().toISOString(),
        metrics: {
          folders: this.requireConfig().settings.folders ?? ['INBOX'],
          syncState: Object.fromEntries(this.syncState),
        },
      };
    } catch (err) {
      this.status = 'error';
      return {
        status: 'error',
        message: `Health check failed: ${err instanceof Error ? err.message : String(err)}`,
        lastChecked: new Date().toISOString(),
      };
    }
  }

  /** Emit an email (send a summary/digest via email). */
  async emit(options: EmitOptions, content: EmitContent): Promise<void> {
    if (!this.transport?.sendEmail) {
      throw new Error('EmailAdapter: transport does not support sending email');
    }
    const to = content.metadata?.['to'];
    if (!to || !Array.isArray(to)) {
      throw new Error('EmailAdapter emit: metadata.to must be a string array of recipients');
    }
    const htmlBody = markdownToSimpleHtml(content.body);
    await this.transport.sendEmail(to as string[], content.title, htmlBody);
  }

  override async shutdown(): Promise<void> {
    if (this.transport) await this.transport.disconnect();
    this.syncState.clear();
    await super.shutdown();
  }

  getSyncState(): Record<string, FolderSyncState> {
    return Object.fromEntries(this.syncState);
  }

  restoreSyncState(state: Record<string, FolderSyncState>): void {
    this.syncState.clear();
    for (const [folder, folderState] of Object.entries(state)) {
      this.syncState.set(folder, folderState);
    }
  }

  private passesFilters(email: RawEmail, filters?: IngestFilter[]): boolean {
    if (!filters || filters.length === 0) return true;
    const includes = filters.filter((f) => f.type === 'include');
    const excludes = filters.filter((f) => f.type === 'exclude');
    if (includes.length > 0) {
      if (!includes.some((f) => emailMatchesFilter(email, f.field, f.pattern))) return false;
    }
    if (excludes.some((f) => emailMatchesFilter(email, f.field, f.pattern))) return false;
    return true;
  }
}
