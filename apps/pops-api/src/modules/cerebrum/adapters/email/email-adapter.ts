/**
 * EmailAdapter — IMAP/API email ingestion adapter for Plexus (PRD-091 US-01).
 *
 * Connects to an email account via IMAP or API, fetches new messages
 * from configured folders, applies filtering rules, and returns
 * EngineData[] for the ingestion pipeline.
 *
 * The actual IMAP/API transport is abstracted behind an EmailTransport
 * interface so the adapter logic can be fully tested without a real server.
 * A production IMAP transport (using imapflow) can be plugged in when
 * the dependency is available.
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
import { emailMatchesFilter, parseEmail, type RawEmail } from './email-parser.js';

// ---------------------------------------------------------------------------
// Adapter-specific settings
// ---------------------------------------------------------------------------

export interface EmailAdapterSettings {
  /** Connection protocol: 'imap' or 'api'. */
  protocol: 'imap' | 'api';
  /** IMAP host (for protocol='imap'). */
  host?: string;
  /** IMAP port (for protocol='imap'). Default 993. */
  port?: number;
  /** Whether to use TLS. Default true. */
  tls?: boolean;
  /** Folders to monitor. Default ['INBOX']. */
  folders?: string[];
  /** Scope label: 'personal' or 'work'. Used to derive scope (e.g. 'personal.email'). */
  scopeLabel?: string;
  /** Poll interval in minutes. Default 15. */
  pollIntervalMinutes?: number;
}

// ---------------------------------------------------------------------------
// Email transport abstraction
// ---------------------------------------------------------------------------

/**
 * Abstraction over the email transport (IMAP, API, etc.).
 * Enables testing without a real mail server.
 */
export interface EmailTransport {
  /** Establish connection / authenticate. */
  connect(config: AdapterConfig<EmailAdapterSettings>): Promise<void>;
  /** Fetch emails from a folder since a given timestamp. */
  fetchEmails(folder: string, since?: Date, limit?: number): Promise<RawEmail[]>;
  /** Lightweight connection check (IMAP NOOP or API ping). */
  ping(): Promise<boolean>;
  /** Send an email (for emit support). */
  sendEmail?(to: string[], subject: string, htmlBody: string): Promise<void>;
  /** Disconnect / cleanup. */
  disconnect(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Sync state
// ---------------------------------------------------------------------------

interface FolderSyncState {
  /** Last synced timestamp per folder. */
  lastSynced: string;
}

// ---------------------------------------------------------------------------
// EmailAdapter
// ---------------------------------------------------------------------------

export class EmailAdapter extends BaseAdapter<EmailAdapterSettings> {
  readonly name = 'email';

  private transport: EmailTransport | null = null;
  private syncState = new Map<string, FolderSyncState>();

  constructor(transport?: EmailTransport) {
    super();
    this.transport = transport ?? null;
  }

  /** Set or replace the transport (for dependency injection / testing). */
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
    if (!this.transport) {
      throw new Error('EmailAdapter: no transport configured');
    }

    const folders = config.settings.folders ?? ['INBOX'];
    const scopeLabel = config.settings.scopeLabel ?? 'personal';
    const scope = `${scopeLabel}.email`;
    const allResults: EngineData[] = [];

    for (const folder of folders) {
      const folderState = this.syncState.get(folder);
      const since = options.since ?? (folderState ? new Date(folderState.lastSynced) : undefined);

      const emails = await this.transport.fetchEmails(folder, since, options.limit);

      for (const email of emails) {
        // Apply filters
        if (!this.passesFilters(email, options.filters)) {
          continue;
        }

        const engineData = parseEmail(email, { scopeLabel: scope });
        allResults.push(engineData);
      }

      // Update sync state for this folder
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

    // If the adapter is in an error state (e.g. failed to initialise), report
    // that directly rather than attempting a ping on a broken connection.
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

    // Basic Markdown → HTML conversion for email body
    const htmlBody = markdownToSimpleHtml(content.body);

    await this.transport.sendEmail(to as string[], content.title, htmlBody);
  }

  override async shutdown(): Promise<void> {
    if (this.transport) {
      await this.transport.disconnect();
    }
    this.syncState.clear();
    await super.shutdown();
  }

  /** Get the current sync state (for persistence / debugging). */
  getSyncState(): Record<string, FolderSyncState> {
    return Object.fromEntries(this.syncState);
  }

  /** Restore sync state (e.g. from database). */
  restoreSyncState(state: Record<string, FolderSyncState>): void {
    this.syncState.clear();
    for (const [folder, folderState] of Object.entries(state)) {
      this.syncState.set(folder, folderState);
    }
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /**
   * Check if an email passes the include/exclude filter rules.
   * Include filters are evaluated first; then exclude filters run on the result.
   */
  private passesFilters(email: RawEmail, filters?: IngestFilter[]): boolean {
    if (!filters || filters.length === 0) return true;

    const includes = filters.filter((f) => f.type === 'include');
    const excludes = filters.filter((f) => f.type === 'exclude');

    // If there are include filters, at least one must match
    if (includes.length > 0) {
      const included = includes.some((f) => emailMatchesFilter(email, f.field, f.pattern));
      if (!included) return false;
    }

    // If there are exclude filters, none must match
    if (excludes.length > 0) {
      const excluded = excludes.some((f) => emailMatchesFilter(email, f.field, f.pattern));
      if (excluded) return false;
    }

    return true;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal Markdown → HTML for email emit. */
function markdownToSimpleHtml(md: string): string {
  let html = md;

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold / italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // List items
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');

  // Paragraphs (double newline)
  html = html.replace(/\n\n/g, '</p><p>');
  html = `<p>${html}</p>`;

  // Single newlines → <br>
  html = html.replace(/\n/g, '<br>');

  return html;
}
