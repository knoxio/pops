# Lists shell module & manifest

## Purpose

Register the lists frontend as a module the SPA host (`pillars/shell`) can mount.
The module declares a `ModuleManifest`, owns the `/lists` route subtree, and
contributes a sidebar entry. The shell discovers it at runtime from the manifest
— no shell code change is needed to add lists.

Lists is generic and depends on no other module. Food consumes lists (it sends
items into shopping lists), but the dependency is one-directional and runtime
only: food calls the lists pillar over the SDK, never imports the lists module's
code. A deployment can run lists without food (manual list-keeping) or food
without lists (the Send-to-list affordance degrades gracefully).

## Manifest

Two manifests describe the pillar, both with `id='lists'`:

- **Pillar manifest** — `src/contract/manifest.ts`, exported as `listsManifest`
  via the `@pops/lists/manifest` entry. Public, FE-safe. This is what the
  registry-driven loader and module discovery consume.
- **Frontend manifest** — `pillars/lists/app/src/manifest.ts`, the SPA module
  manifest carrying `frontend: { routes, navConfig }`.

Both declare:

```ts
{
  id: 'lists',
  name: 'Lists',
  version: '0.1.0',
  surfaces: ['app'],
  description: 'Generic lists — shopping, packing, todo. Food is the first consumer.',
}
```

`id='lists'` is the registry key. Lists declares no settings dimension.

## Routes & nav

`pillars/lists/app/src/routes.tsx` exports `routes` and `navConfig`:

```ts
export const navConfig = {
  id: 'lists',
  label: 'Lists',
  labelKey: 'lists',
  icon: 'ListChecks',
  color: 'sky',
  basePath: '/lists',
  items: [{ path: '', label: 'Home', labelKey: 'lists.home', icon: 'LayoutDashboard' }],
};

export const routes = [
  { index: true, element: <ListsIndexPage /> },
  { path: ':id', element: <ListDetailPage /> },
];
```

- The index route (`/lists`) renders the lists index; `:id` (`/lists/:id`) is the
  detail page. Detail pages are deep links, not sidebar entries.
- Pages are code-split via `lazy()`.
- `navConfig.icon` is constrained to a narrow local `IconName` union
  (`ListChecks` | `LayoutDashboard`) rather than a static dep on
  `@pops/navigation`, deliberately, to avoid a `tsc -b` project-reference cycle.
  Each literal must also exist in the shell's icon map; assignability catches
  drift at the shell boundary.

## Cross-module boundary

- The lists module exports **no router type** and is **not statically imported**
  by any consumer module. Food talks to lists exclusively over the wire:
  `pillar('lists').list.create(…)`, `pillar('lists').list.list(…)`,
  `pillar('lists').items.bulkAdd(…)` via `@pops/pillar-sdk`. Types come from the
  lists contract's zod schemas, not from the server.
- No food-specific types leak into lists. The `ref_kind` values `ingredient` /
  `variant` / `recipe` are opaque integers to lists — it happens that food owns
  those entities, but the lists pillar never knows that.

## Rules

- Manifest `id` is `'lists'`; the shell mounts the module by reading the manifest
  at runtime — no shell code edit required.
- The pillar version is `0.1.0`; downstream feature work does not bump it.
- Lists' tables persist even if the module is removed from the installed set
  (non-destructive uninstall).
- Two modules declaring `id='lists'` collide at startup; the registry refuses to
  load. Standard registry behaviour.

## Edge cases

| Case                                          | Behaviour                                                                                                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lists installed but food is not               | `/lists` mounts and works fully; nothing references food.                                                                                                                      |
| Food installed but lists is not               | Food's Send-to-list affordance degrades: it surfaces a "Lists not available" path rather than crashing. Food never persists list IDs on its own rows, so no cleanup is needed. |
| Direct nav to `/lists/:id` for a missing list | Detail page handles the empty/null response (the `GET /lists/:id` body is nullable).                                                                                           |
| Two packages claim `id='lists'`               | Registry collision at startup; load is refused.                                                                                                                                |

## Acceptance criteria

### Manifest

- [x] `src/contract/manifest.ts` exports `listsManifest: ModuleManifest` with
      `id='lists'`, `surfaces=['app']`, and the description above.
- [x] The manifest resolves via the `@pops/lists/manifest` package export and
      nothing else from `src/api` or `src/db` is reachable externally (strict
      `exports` map).
- [x] `pillars/lists/app/src/manifest.ts` exports `manifest` with the same `id`
      and `frontend: { routes, navConfig }` populated.

### Routes & nav

- [x] `pillars/lists/app/src/routes.tsx` exports `routes` (index + `:id`) and
      `navConfig` matching the shell's `AppNavConfig` shape.
- [x] The `/lists` route renders the index; `/lists/:id` renders the detail page.
- [x] The sidebar shows a "Lists" entry with the `ListChecks` icon.

### Cross-module behaviour

- [x] The lists module exports no router type; consumers reach it only via the
      SDK proxy or `openapi/lists.openapi.json`.
- [x] No consumer module statically imports lists' frontend or db internals.

### Tests

- [x] A test asserts `manifest.id === 'lists'` and that `routes` contains the
      index and `:id` routes (`pillars/lists/app/src/__tests__/manifest.test.ts`).
      </content>
