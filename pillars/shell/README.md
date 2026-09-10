# @pops/shell

The **shell** pillar — the single Vite/React SPA host for POPS. It lazy-loads
each domain's feature app and renders the federated navigation assembled from
the live registry. It is a **UI pillar**: it owns no SQLite DB and serves no
data procedures. Its manifest carries a sentinel contract block plus empty
capability arrays — the registry's manifest schema requires those fields, so a
UI pillar fills them with empties rather than dropping them.

The frontend source lives in `pillars/shell/src` — `main.tsx` plus `app/` (the
boot install-set resolver, router, chrome, pages, overlays), `components/`,
`store/`, `i18n/` and the generated `registry-api/` client. The production image
is `nginx:1.31.3-alpine` with a Node binary added (`apk add nodejs`): nginx serves the
built bundle, Node runs the boot-time conf render and the long-lived registry
watcher. That pipeline is documented in [`scripts/README.md`](scripts/README.md)
and in each script's own header.

## UI-pillar registration

The `ManifestPayloadSchema` (in `@pops/pillar-sdk`) is `.strict()` and requires
`contract`, `routes`, `search`, `ai`, `uri`, `consumedSettings`, and
`healthcheck`, so `buildShellManifest()` emits all of them — empties plus a
sentinel contract triplet — rather than omitting them:

```jsonc
{
  "pillarId": "shell",
  "baseUrl": "https://pops.local",
  "manifest": {
    "pillar": "shell",
    "version": "0.1.0",
    "contract": {
      "package": "@pops/shell-contract",
      "version": "0.1.0",
      "tag": "contract-shell@v0.1.0",
    },
    "routes": { "queries": [], "mutations": [], "subscriptions": [] },
    "search": { "adapters": [] },
    "ai": { "tools": [] },
    "uri": { "types": [] },
    "consumedSettings": { "keys": [] },
    "healthcheck": { "path": "/health" },
  },
  "apiKey": "<POPS_INTERNAL_API_KEY>",
}
```

`manifest.pillar` MUST equal `pillarId` — the registry rejects a mismatch. The
shell ships the `-contract` form.

### Registration runs at deploy time, not in the browser

The CLI entrypoint `scripts/register-with-registry.ts` delegates to
`registerShellWithRegistry` in `src/lib/register-with-registry.ts`. Run it with
the same secrets every other pillar uses:

```bash
POPS_REGISTRY_URL=http://registry-api:3001 \
SHELL_BASE_URL=https://pops.local \
POPS_INTERNAL_API_KEY=… \
  pnpm --filter @pops/shell registry:register
```

> Endpoint note: `src/lib/register-with-registry.ts` POSTs to
> `/core.registry.register`. The `registry` pillar mounts every registry
> operation on both that path and the canonical `/registry/register` (see the
> pillar SDK's `REGISTRY_PATHS` / `LEGACY_REGISTRY_PATHS`), so either resolves.

The trust model and the best-effort failure policy are in those two files'
headers; the outcome shapes are the `RegisterShellOutcome` union in the lib.
Every outcome exits `0` so a partially-configured deploy still boots — only an
unexpected throw sets a non-zero exit code.

## How a pillar's UI reaches the shell

One way, and `scripts/check-pillar-ui-reachability.mjs` asserts every
`pillars/*/app` uses it.

**The runtime loader.** The pillar's wire manifest advertises `assetsBaseUrl`
and `pages`; `src/app/external-ui.tsx` `import()`s the bundle at that URL on
first navigation and resolves each `PageDescriptor.bundleSlot` against the
module's `bundles` export. Every in-repo pillar arrives this way, by the same
mechanism an out-of-tree pillar would — there is no in-tree shortcut left to
diverge from.

Until POPS-3227 there was a second route: a static bundle map statically
imported the published `@pops/app-<pillar>` package and the shell mounted its
routes at build time. That file is gone, and with it the shell's dependency on
any pillar package.

### The shared-runtime contract

A loader-mounted pillar is a separate build, so anything it bundles is a second
copy at runtime — and for a package holding React context or module-global
state a second copy is a correctness failure no build reports: two React copies
throw `Invalid hook call` on the pillar's first hook, two `@tanstack/react-query`
copies read an empty cache through a provider they cannot see, two `i18next`
copies render raw keys.

So the pillar's build marks those packages external
(`SHARED_RUNTIME_SPECIFIERS` in `@pops/pillar-sdk/remote-build`, enforced by
its own build script), and the shell answers the bare specifiers that leaves in
the bundle. `vite-plugin-shared-runtime.ts` does that: one re-export facade per
specifier as its own build entry, plus an import map in `index.html` naming the
emitted files. Three things about it are load-bearing and none is obvious:

- **`preserveEntrySignatures: 'allow-extension'`.** Without it the facade
  entries are emitted with no exports at all — the bundler sees nothing inside
  the build importing them and prunes the signature to its side effects. The
  files still appear and still import the right chunks; they just hand a pillar
  an empty namespace.
- **The facades name their exports.** `export * from 'react'` forwards nothing,
  because React is CommonJS: a bundler wraps it in a factory and resolves named
  imports as property reads, so there is no static list to forward. The names
  are read from Node's own module namespace at build time.
- **No module of a shared package may land in two chunks.** The import map
  points at one file per specifier, and that is the shell's own instance only
  while that holds. The build asserts it and fails if it stops being true.

In dev the import map names the dev server's own URL for each facade, so a
bundle built for production loads unmodified against `pnpm dev`.

### Serving a pillar's bundle

`assetsBaseUrl` is root-relative (`/purchases-ui/purchases.js`). An in-repo
pillar cannot know the origin the browser reached the shell on — one deployment
answers to a LAN name, a Tailscale name and `localhost` — and same-origin is
also what lets the import map govern the bundle with no CORS posture at all.

In production the generated `nginx.conf` carries a `/<pillar>-ui/` location per
pillar, proxying to `<pillar>-ui:80`. That is a convention rather than a list of
which pillars have a UI: a list is the central enumeration ADR-039 Invariant 5
removes, and the variable-form `proxy_pass` makes an absent UI container a 502
on its own path instead of a boot failure. The bundle itself is a static nginx
image built from the pillar's app (`pillars/purchases/app/Dockerfile`), the same
shape the design playground uses.

In dev, `vite-plugin-pillar-ui-dev.ts` serves `pillars/<id>/app/dist/remote` at
the same path, so the loader path is exercised locally rather than first in a
deployment. Build the bundle with
`pnpm --filter @pops/app-<pillar> build`; until you do, the shell renders its
"could not be loaded" placeholder, which is the same degradation a missing
bundle produces in production.

### The floor when the registry is unreachable

Boot tries three sources, in order, and reports which one it used as
`BootRegistry.source`:

1. **`registry`** — the live snapshot. The normal path.
2. **`cached-snapshot`** — the last snapshot that resolved to a usable shell,
   kept in `localStorage` (`src/app/snapshot-cache.ts`).
3. **`static-floor`** — the pillars still in the bundle map.

The cache exists because the third source is disappearing. It used to be the
whole floor: whatever the build had compiled in was what the shell mounted when
`registry-api` was unreachable. POPS-3215 empties the bundle map one pillar at
a time, and at the end of it that floor is nothing — the shell would boot to its
own chrome, an empty rail and the settings page (POPS-3239).

A registry outage is not a pillar outage. `registry-api` can be down or
mid-restart while `finance-api` and its UI bundle are both being served
perfectly well, since the shell's own nginx serves `/finance-ui/` either way.
Losing every pillar's UI to a pillar-_discovery_ problem is a worse trade than
mounting the set that answered last time.

What is cached is the **wire snapshot**, not the resolved surface: the surface
holds React components and would not survive `JSON.stringify`, while the
snapshot is the JSON the registry sent and re-resolves through the same walk. It
is re-validated against `ManifestPayloadSchema` on every read, because the value
outlives deploys and anything on the origin can write it.

**It does not expire.** A stale entry advertises a pillar that may have gone,
and that failure is already contained — the loader wraps every remote page in an
error boundary, so a bundle that 404s degrades to a placeholder on that pillar
alone. An expiry has the opposite failure: a machine left off for longer than
the window boots to the empty shell this exists to prevent. Every successful
boot overwrites the entry.

## Overlay mount contract

The props an overlay receives are `OverlayComponentProps` in
`src/app/overlays/OverlayHost.tsx`.

The named chrome slots are **`assistant`, `notification`, `command`** — and
that list is declared **twice**, as two independent literals in two packages:

| Declaration site                                                      | Effect                                                                                                                                |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/overlays/OverlayHost.tsx` — `KNOWN_CHROME_SLOTS`             | Runtime. An overlay declaring anything else is dropped at module load with a `console.warn`; the shell still boots.                   |
| `libs/module-registry/scripts/chrome-slots.ts` — `KNOWN_CHROME_SLOTS` | Registry codegen. `warnUnknownChromeSlots`, called from `validateManifests`, writes to stderr. Deliberately a warning, never a throw. |

Nothing cross-checks the two lists, and a new slot needs a third file besides:
`RootLayout` renders one `<OverlayHost slot="…" />` per slot, each inside a
`data-overlay-slot` wrapper div. The `slot` prop is typed
`KnownChromeSlot`, which does **not** force a host to exist — add a slot to
the tuple and forget the host, and overlays declaring it compile and silently
never mount. (The bucket record in `buildSlotMounts` is type-checked against
the tuple, so that half is caught.)

One host per slot, any number of overlays per host: `OverlayHost` mounts every
installed overlay whose `chromeSlot` equals its `slot` prop. Two overlays
declaring the same slot both mount — there is no collision rejection at
codegen, boot, or mount, and no z-index arbitration in the shell (overlays own
their own positioning; the wrapper divs are bare anchors).

Getting mounted at all needs both halves of `src/app/overlays/registry.ts`:
the manifest must be in the shell-local `SHELL_OVERLAY_MANIFESTS` array — a
static import, so adding an overlay edits shell source — **and** its id must
be in `INSTALLED_MODULES`. A manifest with no `frontend.overlay.component`
loader is projected away and never mounts. `assistant` is the only occupied
slot today, held by `@pops/overlay-ego`.

## Commands

```bash
pnpm --filter @pops/shell dev          # Vite dev server
pnpm --filter @pops/shell build        # tsc + vite build
pnpm --filter @pops/shell test         # vitest run
pnpm --filter @pops/shell test:e2e     # playwright test
pnpm --filter @pops/shell typecheck    # tsc --noEmit
```

`mise tasks` (from `pillars/shell/mise.toml`) wraps the same set plus `lint`
(`oxlint src && oxfmt --check .`, which has no `package.json` equivalent):
`mise run build | dev | typecheck | test | test:e2e | lint`.
