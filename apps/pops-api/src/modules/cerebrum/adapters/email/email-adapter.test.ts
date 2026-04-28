/**
 * Tests for the EmailAdapter and email parser (PRD-091 US-01).
 *
 * Covers:
 * - Email → EngineData parsing (subject, body, tags, scopes)
 * - HTML → Markdown stripping
 * - Filter matching (subject, sender, folder)
 * - Adapter lifecycle (initialize, ingest, healthCheck, shutdown)
 * - Incremental sync (only new emails fetched)
 * - Emit (sending email)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EmailAdapter, type EmailAdapterSettings, type EmailTransport } from './email-adapter.js';
import {
  buildEmailTags,
  emailMatchesFilter,
  parseEmail,
  stripHtmlToMarkdown,
  type RawEmail,
} from './email-parser.js';

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

function makeEmail(overrides: Partial<RawEmail> = {}): RawEmail {
  return {
    messageId: '<abc123@example.com>',
    subject: 'Weekly standup notes',
    textBody: 'Here are the notes from today.',
    from: 'Alice <alice@example.com>',
    to: ['bob@example.com', 'Carol <carol@example.com>'],
    cc: ['dave@example.com'],
    folder: 'INBOX',
    date: '2026-04-28T09:00:00Z',
    ...overrides,
  };
}

function makeConfig(
  overrides: Partial<EmailAdapterSettings> = {}
): AdapterConfig<EmailAdapterSettings> {
  return {
    name: 'email',
    credentials: { user: 'test@example.com', password: 'secret' },
    settings: {
      protocol: 'imap',
      host: 'imap.example.com',
      port: 993,
      tls: true,
      folders: ['INBOX'],
      scopeLabel: 'personal',
      ...overrides,
    },
  };
}

function createMockTransport(emails: RawEmail[] = []): EmailTransport {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    fetchEmails: vi.fn().mockResolvedValue(emails),
    ping: vi.fn().mockResolvedValue(true),
    sendEmail: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// Email parser tests
// ---------------------------------------------------------------------------

describe('stripHtmlToMarkdown', () => {
  it('converts headers to markdown', () => {
    const html = '<h1>Title</h1><h2>Subtitle</h2>';
    const md = stripHtmlToMarkdown(html);
    expect(md).toContain('# Title');
    expect(md).toContain('## Subtitle');
  });

  it('converts bold and italic', () => {
    const html = '<strong>bold</strong> and <em>italic</em>';
    const md = stripHtmlToMarkdown(html);
    expect(md).toContain('**bold**');
    expect(md).toContain('*italic*');
  });

  it('converts links', () => {
    const html = '<a href="https://example.com">Click here</a>';
    const md = stripHtmlToMarkdown(html);
    expect(md).toContain('[Click here](https://example.com)');
  });

  it('converts list items', () => {
    const html = '<ul><li>Item 1</li><li>Item 2</li></ul>';
    const md = stripHtmlToMarkdown(html);
    expect(md).toContain('- Item 1');
    expect(md).toContain('- Item 2');
  });

  it('removes script and style blocks', () => {
    const html = '<script>alert("xss")</script><style>.foo{}</style>Hello';
    const md = stripHtmlToMarkdown(html);
    expect(md).not.toContain('alert');
    expect(md).not.toContain('.foo');
    expect(md).toContain('Hello');
  });

  it('removes tracking pixels (1x1 images)', () => {
    const html = 'Content<img width="1" height="1" src="https://track.example.com/pixel.gif">';
    const md = stripHtmlToMarkdown(html);
    expect(md).not.toContain('track.example.com');
    expect(md).toContain('Content');
  });

  it('decodes HTML entities', () => {
    const html = '&amp; &lt; &gt; &quot; &#39; &nbsp;';
    const md = stripHtmlToMarkdown(html);
    expect(md).toContain('& < > " \'');
  });

  it('handles empty input', () => {
    expect(stripHtmlToMarkdown('')).toBe('');
  });

  it('converts blockquotes', () => {
    const html = '<blockquote>A quoted line</blockquote>';
    const md = stripHtmlToMarkdown(html);
    expect(md).toContain('> A quoted line');
  });
});

describe('buildEmailTags', () => {
  it('extracts sender, recipients, cc, and folder as tags', () => {
    const email = makeEmail();
    const tags = buildEmailTags(email);

    expect(tags).toContain('from:alice@example.com');
    expect(tags).toContain('to:bob@example.com');
    expect(tags).toContain('to:carol@example.com');
    expect(tags).toContain('cc:dave@example.com');
    expect(tags).toContain('folder:inbox');
  });

  it('adds has-attachment tag when attachments present', () => {
    const email = makeEmail({ attachments: ['report.pdf'] });
    const tags = buildEmailTags(email);
    expect(tags).toContain('has-attachment');
  });

  it('adds has-attachment tag when hasAttachment flag is set', () => {
    const email = makeEmail({ hasAttachment: true });
    const tags = buildEmailTags(email);
    expect(tags).toContain('has-attachment');
  });

  it('omits has-attachment when no attachments', () => {
    const email = makeEmail({ attachments: [], hasAttachment: false });
    const tags = buildEmailTags(email);
    expect(tags).not.toContain('has-attachment');
  });

  it('handles email addresses with angle brackets', () => {
    const email = makeEmail({ from: 'Alice Smith <alice@work.com>' });
    const tags = buildEmailTags(email);
    expect(tags).toContain('from:alice@work.com');
  });

  it('handles bare email addresses', () => {
    const email = makeEmail({ from: 'alice@work.com' });
    const tags = buildEmailTags(email);
    expect(tags).toContain('from:alice@work.com');
  });
});

describe('parseEmail', () => {
  it('converts a basic email to EngineData', () => {
    const email = makeEmail();
    const result = parseEmail(email, { scopeLabel: 'personal.email' });

    expect(result.title).toBe('Weekly standup notes');
    expect(result.body).toBe('Here are the notes from today.');
    expect(result.source).toBe('plexus:email');
    expect(result.externalId).toBe('<abc123@example.com>');
    expect(result.scopes).toEqual(['personal.email']);
    expect(result.tags).toContain('from:alice@example.com');
  });

  it('falls back to HTML body when text body is empty', () => {
    const email = makeEmail({
      textBody: '',
      htmlBody: '<p>HTML <strong>content</strong></p>',
    });
    const result = parseEmail(email, { scopeLabel: 'work.email' });
    expect(result.body).toContain('**content**');
    expect(result.scopes).toEqual(['work.email']);
  });

  it('produces "(no body)" when both text and html are empty', () => {
    const email = makeEmail({ textBody: '', htmlBody: '' });
    const result = parseEmail(email, { scopeLabel: 'personal.email' });
    expect(result.body).toBe('(no body)');
  });

  it('produces "(no subject)" when subject is empty', () => {
    const email = makeEmail({ subject: '' });
    const result = parseEmail(email, { scopeLabel: 'personal.email' });
    expect(result.title).toBe('(no subject)');
  });

  it('appends attachment listing to body', () => {
    const email = makeEmail({ attachments: ['report.pdf', 'data.csv'] });
    const result = parseEmail(email, { scopeLabel: 'personal.email' });
    expect(result.body).toContain('**Attachments:**');
    expect(result.body).toContain('- report.pdf');
    expect(result.body).toContain('- data.csv');
  });

  it('includes custom fields with email metadata', () => {
    const email = makeEmail();
    const result = parseEmail(email, { scopeLabel: 'personal.email' });

    expect(result.customFields).toBeDefined();
    expect(result.customFields?.['from']).toBe('Alice <alice@example.com>');
    expect(result.customFields?.['folder']).toBe('INBOX');
    expect(result.customFields?.['has_attachment']).toBe(false);
  });
});

describe('emailMatchesFilter', () => {
  const email = makeEmail();

  it('matches subject patterns', () => {
    expect(emailMatchesFilter(email, 'subject', 'standup')).toBe(true);
    expect(emailMatchesFilter(email, 'subject', 'unrelated')).toBe(false);
  });

  it('matches sender patterns', () => {
    expect(emailMatchesFilter(email, 'from', 'alice')).toBe(true);
    expect(emailMatchesFilter(email, 'from', 'unknown@')).toBe(false);
  });

  it('matches to addresses', () => {
    expect(emailMatchesFilter(email, 'to', 'bob@')).toBe(true);
    expect(emailMatchesFilter(email, 'to', 'unknown@')).toBe(false);
  });

  it('matches cc addresses', () => {
    expect(emailMatchesFilter(email, 'cc', 'dave')).toBe(true);
    expect(emailMatchesFilter(email, 'cc', 'unknown')).toBe(false);
  });

  it('matches folder', () => {
    expect(emailMatchesFilter(email, 'folder', 'INBOX')).toBe(true);
    expect(emailMatchesFilter(email, 'folder', 'Sent')).toBe(false);
  });

  it('returns false for unknown fields', () => {
    expect(emailMatchesFilter(email, 'nonexistent', '.*')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// EmailAdapter tests
// ---------------------------------------------------------------------------

describe('EmailAdapter', () => {
  let adapter: EmailAdapter;
  let transport: EmailTransport;

  beforeEach(() => {
    transport = createMockTransport([makeEmail()]);
    adapter = new EmailAdapter(transport);
  });

  describe('initialize', () => {
    it('connects transport and transitions to healthy', async () => {
      await adapter.initialize(makeConfig());

      expect(transport.connect).toHaveBeenCalledTimes(1);
      const status = await adapter.healthCheck();
      expect(status.status).toBe('healthy');
    });

    it('throws and sets error status when transport fails to connect', async () => {
      const failTransport = createMockTransport();
      vi.mocked(failTransport.connect).mockRejectedValue(new Error('Connection refused'));

      const failAdapter = new EmailAdapter(failTransport);
      await expect(failAdapter.initialize(makeConfig())).rejects.toThrow('failed to connect');

      const status = await failAdapter.healthCheck();
      expect(status.status).toBe('error');
    });

    it('throws when no transport is configured', async () => {
      const noTransportAdapter = new EmailAdapter();
      await expect(noTransportAdapter.initialize(makeConfig())).rejects.toThrow(
        'no transport configured'
      );
    });
  });

  describe('ingest', () => {
    it('fetches emails from configured folders and returns EngineData', async () => {
      await adapter.initialize(makeConfig());

      const results = await adapter.ingest({});
      expect(results).toHaveLength(1);
      expect(at(results, 0).source).toBe('plexus:email');
      expect(at(results, 0).title).toBe('Weekly standup notes');
    });

    it('fetches from multiple folders', async () => {
      const email1 = makeEmail({ folder: 'INBOX', messageId: '<1@ex.com>' });
      const email2 = makeEmail({ folder: 'Work', messageId: '<2@ex.com>' });

      const multiTransport = createMockTransport();
      vi.mocked(multiTransport.fetchEmails)
        .mockResolvedValueOnce([email1])
        .mockResolvedValueOnce([email2]);

      const multiAdapter = new EmailAdapter(multiTransport);
      await multiAdapter.initialize(makeConfig({ folders: ['INBOX', 'Work'] }));

      const results = await multiAdapter.ingest({});
      expect(results).toHaveLength(2);
    });

    it('applies exclude filters', async () => {
      const email1 = makeEmail({ subject: 'JIRA notification [PROJECT-123]' });
      const email2 = makeEmail({ subject: 'Important update', messageId: '<2@ex.com>' });

      const filteredTransport = createMockTransport([email1, email2]);
      const filteredAdapter = new EmailAdapter(filteredTransport);
      await filteredAdapter.initialize(makeConfig());

      const filters: IngestFilter[] = [
        { field: 'subject', pattern: 'JIRA notification', type: 'exclude' },
      ];

      const results = await filteredAdapter.ingest({ filters });
      expect(results).toHaveLength(1);
      expect(at(results, 0).title).toBe('Important update');
    });

    it('applies include filters (only matching emails pass)', async () => {
      const email1 = makeEmail({ from: 'boss@company.com', messageId: '<1@ex.com>' });
      const email2 = makeEmail({ from: 'spam@random.com', messageId: '<2@ex.com>' });

      const filteredTransport = createMockTransport([email1, email2]);
      const filteredAdapter = new EmailAdapter(filteredTransport);
      await filteredAdapter.initialize(makeConfig());

      const filters: IngestFilter[] = [
        { field: 'from', pattern: '@company\\.com', type: 'include' },
      ];

      const results = await filteredAdapter.ingest({ filters });
      expect(results).toHaveLength(1);
      expect(at(results, 0).tags).toContain('from:boss@company.com');
    });

    it('tracks sync state per folder for incremental sync', async () => {
      await adapter.initialize(makeConfig());

      await adapter.ingest({});
      const state = adapter.getSyncState();
      const inboxState = state['INBOX'];
      expect(inboxState).toBeDefined();
      expect(inboxState?.lastSynced).toBeDefined();
    });

    it('uses default scope when scopeLabel is not configured', async () => {
      const defaultConfig = makeConfig();
      delete defaultConfig.settings.scopeLabel;

      const defaultAdapter = new EmailAdapter(createMockTransport([makeEmail()]));
      await defaultAdapter.initialize(defaultConfig);

      const results = await defaultAdapter.ingest({});
      expect(at(results, 0).scopes).toEqual(['personal.email']);
    });
  });

  describe('healthCheck', () => {
    it('returns healthy when ping succeeds', async () => {
      await adapter.initialize(makeConfig());
      const status = await adapter.healthCheck();

      expect(status.status).toBe('healthy');
      expect(status.message).toContain('alive');
    });

    it('returns degraded when ping fails', async () => {
      vi.mocked(transport.ping).mockResolvedValue(false);
      await adapter.initialize(makeConfig());

      const status = await adapter.healthCheck();
      expect(status.status).toBe('degraded');
    });

    it('returns error when ping throws', async () => {
      vi.mocked(transport.ping).mockRejectedValue(new Error('Connection reset'));
      await adapter.initialize(makeConfig());

      const status = await adapter.healthCheck();
      expect(status.status).toBe('error');
      expect(status.message).toContain('Connection reset');
    });

    it('returns error when no transport configured', async () => {
      const noTransportAdapter = new EmailAdapter();
      const status = await noTransportAdapter.healthCheck();
      expect(status.status).toBe('error');
      expect(status.message).toContain('No transport');
    });
  });

  describe('emit', () => {
    it('sends email via transport', async () => {
      await adapter.initialize(makeConfig());

      await adapter.emit(
        { target: 'email' },
        {
          title: 'Weekly Summary',
          body: '# Summary\n\nHere are the highlights.',
          metadata: { to: ['reader@example.com'] },
        }
      );

      expect(transport.sendEmail).toHaveBeenCalledTimes(1);
      expect(transport.sendEmail).toHaveBeenCalledWith(
        ['reader@example.com'],
        'Weekly Summary',
        expect.stringContaining('<h1>Summary</h1>')
      );
    });

    it('throws when metadata.to is missing', async () => {
      await adapter.initialize(makeConfig());

      await expect(
        adapter.emit({ target: 'email' }, { title: 'Test', body: 'Body' })
      ).rejects.toThrow('metadata.to must be a string array');
    });

    it('throws when transport does not support sending', async () => {
      const noSendTransport: EmailTransport = {
        connect: vi.fn().mockResolvedValue(undefined),
        fetchEmails: vi.fn().mockResolvedValue([]),
        ping: vi.fn().mockResolvedValue(true),
        disconnect: vi.fn().mockResolvedValue(undefined),
      };

      const noSendAdapter = new EmailAdapter(noSendTransport);
      await noSendAdapter.initialize(makeConfig());

      await expect(
        noSendAdapter.emit(
          { target: 'email' },
          { title: 'Test', body: 'Body', metadata: { to: ['x@y.com'] } }
        )
      ).rejects.toThrow('does not support sending');
    });
  });

  describe('shutdown', () => {
    it('disconnects transport and clears sync state', async () => {
      await adapter.initialize(makeConfig());
      await adapter.ingest({});

      await adapter.shutdown();

      expect(transport.disconnect).toHaveBeenCalledTimes(1);
      expect(adapter.getSyncState()).toEqual({});
    });
  });

  describe('sync state persistence', () => {
    it('restores sync state from external storage', async () => {
      await adapter.initialize(makeConfig());

      adapter.restoreSyncState({
        INBOX: { lastSynced: '2026-04-20T00:00:00Z' },
        Work: { lastSynced: '2026-04-19T00:00:00Z' },
      });

      const state = adapter.getSyncState();
      expect(state['INBOX']?.lastSynced).toBe('2026-04-20T00:00:00Z');
      expect(state['Work']?.lastSynced).toBe('2026-04-19T00:00:00Z');
    });
  });
});
