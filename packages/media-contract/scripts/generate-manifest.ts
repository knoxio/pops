/**
 * Manifest type generator for `@pops/media-contract` (Theme 13 PRD-155).
 *
 * Emits `src/manifest.generated.ts` from the contract's hand-maintained
 * surface (`types/movie.ts`, `errors.ts`, `router.ts`) plus the version
 * declared in `package.json`. The output is committed, then piped
 * through `oxfmt` so the committed file matches the workspace formatting
 * rules. CI's `verify:manifest` job re-renders + oxfmts in-memory and
 * byte-compares.
 *
 * Imports below intentionally pull `Movie`, `MediaError`, and
 * `MediaRouter` so that running the generator validates that the source
 * modules still expose the symbols the manifest names. A missing or
 * renamed export here makes the codegen fail loudly rather than silently
 * emitting a broken manifest.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

import { MANIFEST_OUTPUT_PATH, readContractVersion, renderManifest } from './render-manifest.js';

import type { MediaError } from '../src/errors.js';
import type { MediaRouter } from '../src/router.js';
import type { Movie } from '../src/types/movie.js';
import type { TvShow } from '../src/types/tv-show.js';
import type { WatchEvent } from '../src/types/watch-event.js';
import type { WatchlistItem } from '../src/types/watchlist-item.js';

export type SurfaceAssertion = [Movie, TvShow, WatchlistItem, WatchEvent, MediaError, MediaRouter];

const version = readContractVersion();
const rendered = renderManifest(version);
writeFileSync(MANIFEST_OUTPUT_PATH, rendered);
execFileSync('pnpm', ['exec', 'oxfmt', '--write', MANIFEST_OUTPUT_PATH], {
  stdio: 'inherit',
});
process.stdout.write(`[media-contract] wrote ${MANIFEST_OUTPUT_PATH} (version=${version})\n`);
