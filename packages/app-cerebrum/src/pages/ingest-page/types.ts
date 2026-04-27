/** Shared types for the ingest page model. */

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
  type: '',
  template: '',
  title: '',
  body: '',
  scopes: [],
  tags: [],
  customFields: {},
};
