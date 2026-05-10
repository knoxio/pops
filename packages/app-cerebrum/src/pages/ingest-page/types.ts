/** Shared types for the ingest page model. */

/**
 * Canonical engram types supported by the ingest pipeline.
 * Must stay in sync with KNOWN_TYPES in apps/pops-api/src/modules/cerebrum/ingest/classifier.ts
 * and the default template files under apps/pops-api/src/modules/cerebrum/templates/defaults/.
 */
export const ENGRAM_TYPES = [
  'capture',
  'note',
  'idea',
  'decision',
  'meeting',
  'journal',
  'research',
] as const;

export type EngramType = (typeof ENGRAM_TYPES)[number];

/** Human-readable Title Case labels for each engram type. */
export const ENGRAM_TYPE_LABELS: Record<EngramType, string> = {
  capture: 'Capture',
  note: 'Note',
  idea: 'Idea',
  decision: 'Decision',
  meeting: 'Meeting',
  journal: 'Journal',
  research: 'Research',
};

/** A template summary returned by cerebrum.templates.list (body excluded). */
export interface TemplateSummary {
  name: string;
  description: string;
  required_fields?: string[];
  suggested_sections?: string[];
  default_scopes?: string[];
  custom_fields?: Record<string, { type: string; description: string }>;
}

/** A scope entry returned by cerebrum.scopes.list. */
export interface ScopeEntry {
  scope: string;
  count: number;
}

/** A tag entry returned by cerebrum.tags.list. */
export interface TagEntry {
  tag: string;
  count: number;
}

export interface IngestFormValues {
  type: string;
  template: string;
  title: string;
  body: string;
  scopes: string[];
  tags: string[];
  customFields: Record<string, unknown>;
}

export interface SubmitResult {
  id: string;
  filePath: string;
  type: string;
}

export const INITIAL_FORM: IngestFormValues = {
  type: 'capture',
  template: '',
  title: '',
  body: '',
  scopes: [],
  tags: [],
  customFields: {},
};
