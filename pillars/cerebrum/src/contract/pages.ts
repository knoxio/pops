/**
 * The pillar's UI surface: one page entry per route the app mounts, pairing
 * the route's path with the bundle slot that names the component rendering
 * it, plus the slot its capture overlay is served from.
 *
 * It lives in the contract because two packages need the same pairing and
 * neither can see the other's source. `src/api/manifest.ts` projects it onto
 * `ManifestPayload.pages` for the registry; `@pops/app-cerebrum` resolves the
 * slot to the component its route table already mounts.
 *
 * **Every route, not only the rail-reachable ones.** The shell mounts
 * exactly the pages listed here and nothing else — so a route missing from
 * this list does not exist (POPS-3225). Six of the thirteen are detail
 * pages reached from a list rather than from the sidebar, which is precisely
 * why they are easy to leave out and hard to notice missing.
 */
export const CEREBRUM_PAGES = [
  { path: '', index: true, bundleSlot: 'cerebrum-ingest' },
  { path: 'chat', bundleSlot: 'cerebrum-chat' },
  { path: 'nudges', bundleSlot: 'cerebrum-nudges' },
  { path: 'proposals', bundleSlot: 'cerebrum-proposals' },
  { path: 'engrams', bundleSlot: 'cerebrum-engrams' },
  { path: 'engrams/:id', bundleSlot: 'cerebrum-engram-detail' },
  { path: 'documents', bundleSlot: 'cerebrum-documents' },
  { path: 'query', bundleSlot: 'cerebrum-query' },
  { path: 'reflex', bundleSlot: 'cerebrum-reflex' },
  { path: 'reflex/:name', bundleSlot: 'cerebrum-reflex-detail' },
  { path: 'plexus', bundleSlot: 'cerebrum-plexus' },
  { path: 'plexus/:adapterId', bundleSlot: 'cerebrum-plexus-detail' },
  { path: 'glia', bundleSlot: 'cerebrum-glia' },
] as const;

/**
 * The slot the capture overlay is served from.
 *
 * It is not a page — nothing routes to it. The shell's capture modal resolves
 * it separately, through the same `bundles` record (POPS-3266), which is why
 * it is declared beside the pages rather than inside them: a bundle carries
 * every surface the pillar contributes, keyed by slot, and the manifest says
 * which slot plays which role.
 */
export const CEREBRUM_CAPTURE_SLOT = 'ingest-form';

/** Every bundle slot the cerebrum UI must supply a component for. */
export type CerebrumPageSlot = (typeof CEREBRUM_PAGES)[number]['bundleSlot'];
export type CerebrumCaptureSlot = typeof CEREBRUM_CAPTURE_SLOT;
