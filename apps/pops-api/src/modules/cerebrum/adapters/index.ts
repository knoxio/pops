/**
 * Plexus adapters barrel export (PRD-091).
 *
 * Re-exports all adapter types, classes, parsers, and transport interfaces.
 */

// Shared types
export type {
  AdapterConfig,
  AdapterHealthStatus,
  AdapterStatus,
  EmitContent,
  EmitOptions,
  EngineData,
  IngestFilter,
  IngestOptions,
  PlexusAdapter,
} from './types.js';
export { BaseAdapter } from './types.js';

// Email adapter
export { EmailAdapter } from './email/email-adapter.js';
export type { EmailAdapterSettings, EmailTransport } from './email/email-adapter.js';
export {
  buildEmailTags,
  emailMatchesFilter,
  parseEmail,
  stripHtmlToMarkdown,
} from './email/email-parser.js';
export type { EmailParserOptions, RawEmail } from './email/email-parser.js';

// Calendar adapter
export { CalendarAdapter } from './calendar/calendar-adapter.js';
export type { CalendarAdapterSettings, CalendarTransport } from './calendar/calendar-adapter.js';
export {
  buildEventTags,
  eventMatchesFilter,
  expandRecurringEvent,
  parseCalendarEvent,
} from './calendar/event-parser.js';
export type { CalendarParserOptions, RawCalendarEvent } from './calendar/event-parser.js';

// GitHub adapter
export { GitHubAdapter } from './github/github-adapter.js';
export type { GitHubAdapterSettings } from './github/github-adapter.js';
export { FetchGitHubTransport, GitHubRateLimitError } from './github/github-transport.js';
export type { GitHubRateLimit, GitHubTransport } from './github/github-transport.js';
export {
  activityMatchesFilter,
  buildActivityTags,
  isBot,
  normaliseGitHubEvent,
  parseGitHubActivity,
} from './github/activity-parser.js';
export type {
  GitHubActor,
  GitHubApiEvent,
  GitHubEventType,
  GitHubLabel,
  GitHubParserOptions,
  RawGitHubActivity,
} from './github/activity-parser.js';
