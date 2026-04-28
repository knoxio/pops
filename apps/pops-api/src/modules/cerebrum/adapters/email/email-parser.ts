import { stripHtmlToMarkdown } from './email-helpers.js';

/**
 * Email parser — converts raw email data into EngineData for ingestion.
 *
 * Handles plain-text and HTML bodies, extracts sender/recipient tags,
 * and formats attachment listings.
 */
import type { EngineData } from '../types.js';

// Re-export for external consumers.
export { stripHtmlToMarkdown } from './email-helpers.js';

// ---------------------------------------------------------------------------
// Raw email types (from IMAP or API)
// ---------------------------------------------------------------------------

export interface RawEmail {
  /** RFC 2822 Message-ID header (used as externalId). */
  messageId: string;
  /** Email subject line. */
  subject: string;
  /** Plain-text body (preferred when available). */
  textBody?: string;
  /** HTML body (stripped to Markdown as fallback). */
  htmlBody?: string;
  /** Sender address. */
  from: string;
  /** Recipient addresses. */
  to: string[];
  /** CC addresses. */
  cc?: string[];
  /** IMAP folder the email was fetched from. */
  folder: string;
  /** Email date (ISO 8601 or Date-parseable string). */
  date: string;
  /** Attachment filenames (content not ingested). */
  attachments?: string[];
  /** Whether the email has attachments. */
  hasAttachment?: boolean;
}

// ---------------------------------------------------------------------------
// Tag extraction
// ---------------------------------------------------------------------------

/**
 * Extract a display name or address from a full email string.
 * e.g. "John Doe <john@example.com>" -> "john@example.com"
 */
function extractEmailAddress(raw: string): string {
  const match = /<([^>]+)>/.exec(raw);
  return match?.[1] ? match[1].toLowerCase() : raw.toLowerCase().trim();
}

/** Build tags from email metadata. */
export function buildEmailTags(email: RawEmail): string[] {
  const tags: string[] = [];

  tags.push(`from:${extractEmailAddress(email.from)}`);

  for (const recipient of email.to) {
    tags.push(`to:${extractEmailAddress(recipient)}`);
  }

  if (email.cc) {
    for (const cc of email.cc) {
      tags.push(`cc:${extractEmailAddress(cc)}`);
    }
  }

  tags.push(`folder:${email.folder.toLowerCase()}`);

  if (email.hasAttachment || (email.attachments && email.attachments.length > 0)) {
    tags.push('has-attachment');
  }

  return tags;
}

// ---------------------------------------------------------------------------
// Body construction
// ---------------------------------------------------------------------------

/** Build the engram body from email content. */
function buildBody(email: RawEmail): string {
  let body = '';

  // Prefer plain text, fall back to stripped HTML
  if (email.textBody && email.textBody.trim().length > 0) {
    body = email.textBody.trim();
  } else if (email.htmlBody && email.htmlBody.trim().length > 0) {
    body = stripHtmlToMarkdown(email.htmlBody);
  }

  // Append attachment listing if present
  if (email.attachments && email.attachments.length > 0) {
    const attachmentList = email.attachments.map((name) => `- ${name}`).join('\n');
    body += `\n\n**Attachments:**\n${attachmentList}`;
  }

  return body || '(no body)';
}

// ---------------------------------------------------------------------------
// Email -> EngineData conversion
// ---------------------------------------------------------------------------

export interface EmailParserOptions {
  /** Default scope label (e.g. 'personal.email' or 'work.email'). */
  scopeLabel: string;
}

/** Convert a raw email into EngineData for the ingestion pipeline. */
export function parseEmail(email: RawEmail, options: EmailParserOptions): EngineData {
  return {
    title: email.subject || '(no subject)',
    body: buildBody(email),
    source: 'plexus:email',
    externalId: email.messageId,
    tags: buildEmailTags(email),
    scopes: [options.scopeLabel],
    customFields: {
      from: email.from,
      to: email.to,
      cc: email.cc ?? [],
      folder: email.folder,
      date: email.date,
      has_attachment: email.hasAttachment ?? (email.attachments?.length ?? 0) > 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Filter helpers
// ---------------------------------------------------------------------------

/** Check if an email matches a filter pattern on a given field. */
export function emailMatchesFilter(email: RawEmail, field: string, pattern: string): boolean {
  const regex = new RegExp(pattern, 'i');

  switch (field) {
    case 'subject':
      return regex.test(email.subject);
    case 'from':
      return regex.test(email.from);
    case 'to':
      return email.to.some((addr) => regex.test(addr));
    case 'cc':
      return (email.cc ?? []).some((addr) => regex.test(addr));
    case 'folder':
      return regex.test(email.folder);
    case 'has_attachment':
      return String(email.hasAttachment ?? (email.attachments?.length ?? 0) > 0) === pattern;
    default:
      return false;
  }
}
