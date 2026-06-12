export const PROJECT_STATUSES = ['planned', 'active', 'archived'] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/**
 * A project — a long-running container that groups list items, tasks, and
 * agenda items under a single goal. Mirrors the API response (camelCase)
 * for the lists pillar.
 *
 * No `projects` table exists in the live `@pops/lists-db` schema yet — the
 * lists pillar currently models work through `lists` + `list_items`. The
 * contract pins the intended shape downstream consumers should code
 * against once the persistence migration lands, mirroring the precedent
 * set by `Warranty` and `Connection` in `@pops/inventory-contract` (PR #2985).
 *
 * Projects form an optional tree via `parentId` (a null parent marks a
 * root project). The status enum is intentionally small + closed; adding
 * a value is a breaking contract change.
 */
export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  description: string | null;
  /** Parent project id, or `null` when this is a root. */
  parentId: string | null;
  /** ISO-8601 timestamp. Validated by `ProjectSchema` via `.datetime()`. */
  lastEditedTime: string;
}
