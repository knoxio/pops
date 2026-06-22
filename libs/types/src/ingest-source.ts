/**
 * Ingest source descriptor — per-module declaration of an external data source
 * the module can ingest from (PRD-101 US-01 typed slot only).
 *
 * Cerebrum's PRD-090 plugin system (Plexus) is the only consumer today and it
 * stays internal to Cerebrum. This descriptor exists so the manifest contract
 * has a typed home for it; no platform-level aggregator wires it in PRD-101.
 *
 * The shape stays minimal — `id` and `label` plus optional `description` —
 * because each consumer interprets the source's runtime semantics. Concrete
 * adapter logic lives in the owning module, not in `@pops/types`.
 */
export interface IngestSourceDescriptor {
  /** Canonical id of the source, e.g. `plex`, `tmdb`, `gmail`. */
  id: string;
  /** Human-readable label shown in admin UIs. */
  label: string;
  /** Optional one-line description for admin UIs. */
  description?: string;
}
