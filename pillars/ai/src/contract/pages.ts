/**
 * The pillar's page surface: one entry per route the app mounts, pairing the
 * route's path with the bundle slot that names the component rendering it.
 *
 * It lives in the contract because two packages need the same pairing and
 * neither can see the other's source. `src/api/manifest.ts` projects it
 * onto `ManifestPayload.pages` for the registry; `@pops/app-ai` resolves the
 * slot to the component its route table already mounts.
 *
 * **Every route, not only the rail-reachable ones.** The shell mounts
 * exactly the pages listed here and nothing else — so a route missing from
 * this list does not exist (POPS-3220). Three of ai's four routes render
 * nothing but a redirect into finance or the settings page, and they are on
 * this list for that reason: leaving them off would turn a working link into
 * a 404 rather than into a page the reader can see is absent.
 */
export const AI_PAGES = [
  { path: '', index: true, bundleSlot: 'ai-usage' },
  { path: 'prompts', bundleSlot: 'ai-prompts' },
  { path: 'config', bundleSlot: 'ai-config' },
  { path: 'rules', bundleSlot: 'ai-rules' },
] as const;

/**
 * Every bundle slot the ai UI must supply a component for. A remote bundle
 * exporting anything other than exactly these keys is a contract break the
 * shell's loader reports as a missing slot at first navigation.
 */
export type AiPageSlot = (typeof AI_PAGES)[number]['bundleSlot'];
