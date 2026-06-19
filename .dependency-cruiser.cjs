/**
 * dependency-cruiser config — module import boundary enforcement.
 *
 * Rules:
 * - packages/app-<x>/** must not import from packages/app-<y>/** (x ≠ y)
 * - apps/pops-api/src/modules/<x>/** must not import from
 *   apps/pops-api/src/modules/<y>/** (y ≠ x and y ≠ core)
 * - Non-owning code must not import @pops/<pillar>-db directly; consumers
 *   go through @pops/<pillar>-contract. Rules generated from
 *   scripts/contract/pillar-list.ts.
 *
 * Allow-listed shared workspace packages for packages/app-*: @pops/ui,
 * @pops/api-client, @pops/navigation, @pops/db-types, @pops/types,
 * @pops/import-tools, @pops/auth, @pops/widgets, @pops/test-utils.
 *
 * See docs/themes/01-foundation/prds/097-module-import-boundaries/ and
 * docs/themes/13-pillar-finale/prds/156-consumer-import-discipline/.
 */
const { contractBoundaryRules } = require('./.dependency-cruiser.rules.generated.cjs');

module.exports = {
  forbidden: [
    {
      name: 'no-cross-app-import',
      severity: 'error',
      comment:
        'packages/app-<x> may not import from another packages/app-<y>. Cross-app communication goes through tRPC or shared workspace packages (@pops/ui, @pops/api-client, @pops/navigation, @pops/db-types, @pops/types, @pops/import-tools, @pops/auth, @pops/widgets, @pops/test-utils).',
      from: { path: '^packages/app-([^/]+)/src' },
      to: {
        path: '^packages/app-([^/]+)/',
        pathNot: '^packages/app-$1/',
      },
    },
    {
      name: 'no-cross-api-module-import',
      severity: 'error',
      comment:
        'apps/pops-api/src/modules/<x> may not import from another modules/<y> (except core). Cross-module access goes through core or via the shared db-types layer.',
      from: { path: '^apps/pops-api/src/modules/([^/]+)/' },
      to: {
        path: '^apps/pops-api/src/modules/([^/]+)/',
        pathNot: '^apps/pops-api/src/modules/($1|core)/',
      },
    },
    {
      name: 'no-dead-lists-pkgs',
      severity: 'error',
      comment:
        'The `@pops/app-lists-db`, `@pops/lists-db`, `@pops/lists-contract`, and `@pops/lists-api` packages no longer exist — lists collapsed into `pillars/lists/`. Consumers go through `@pops/lists` (contract types + api-types + openapi) and the lists REST API for cross-pillar calls.',
      from: { path: '.*' },
      to: { path: '^@pops/(app-lists-db|lists-db|lists-contract|lists-api)(/|$)' },
    },
    {
      name: 'no-dead-inventory-pkgs',
      severity: 'error',
      comment:
        'The `@pops/app-inventory-db`, `@pops/inventory-db`, `@pops/inventory-contract`, and `@pops/inventory-api` packages no longer exist — inventory collapsed into `pillars/inventory/`. Consumers go through `@pops/inventory` (contract types + api-types + openapi) and the inventory REST API for cross-pillar calls.',
      from: { path: '.*' },
      to: { path: '^@pops/(app-inventory-db|inventory-db|inventory-contract|inventory-api)(/|$)' },
    },
    {
      name: 'no-dead-food-pkgs',
      severity: 'error',
      comment:
        'Food has collapsed into `pillars/food/` — `@pops/app-food-db`, `@pops/food-db`, `@pops/food-contract`, `@pops/food-contracts`, and `@pops/food-api` are the retirement tombstone (deleted once the pops-api food module is gone). No new code may import them; consumers go through `@pops/food` (contract types + api-types + openapi) and the food REST API for cross-pillar calls. Existing pops-api food-module imports are grandfathered in the known-violations baseline until they are removed.',
      from: { path: '.*' },
      to: { path: '^@pops/(app-food-db|food-db|food-contract|food-contracts|food-api)(/|$)' },
    },
    {
      name: 'no-dead-finance-pkgs',
      severity: 'error',
      comment:
        'The `@pops/app-finance-db`, `@pops/finance-db`, `@pops/finance-contract`, and `@pops/finance-api` packages are retired — finance collapsed into `pillars/finance/`. Consumers go through `@pops/finance` (contract types + api-types + openapi) and the finance REST API for cross-pillar calls.',
      from: { path: '.*' },
      to: { path: '^@pops/(app-finance-db|finance-db|finance-contract|finance-api)(/|$)' },
    },
    {
      name: 'no-dead-cerebrum-pkgs',
      severity: 'error',
      comment:
        'Cerebrum has collapsed into `pillars/cerebrum/` — `@pops/cerebrum-db`, `@pops/cerebrum-contract`, and `@pops/cerebrum-api` are the retirement tombstone (deleted once the pops-api cerebrum module + pops-cerebrum-api are gone). No new code may import them; consumers go through `@pops/cerebrum` (contract types + api-types + openapi) and the cerebrum REST API for cross-pillar calls. Existing pops-api cerebrum-module imports are grandfathered in the known-violations baseline until they are removed.',
      from: { path: '.*' },
      to: { path: '^@pops/(cerebrum-db|cerebrum-contract|cerebrum-api)(/|$)' },
    },
    {
      name: 'no-dead-media-pkgs',
      severity: 'error',
      comment:
        'Media is collapsing into `pillars/media/` — `@pops/app-media-db`, `@pops/media-db`, `@pops/media-contract`, and `@pops/media-api` are the retirement tombstone (deleted once the pops-api media module is gone). No new code may import them; consumers go through `@pops/media` (contract types + api-types + openapi) and the media REST API for cross-pillar calls. Existing pops-api media-module imports are grandfathered in the known-violations baseline until they are removed.',
      from: { path: '.*' },
      to: { path: '^@pops/(app-media-db|media-db|media-contract|media-api)(/|$)' },
    },
    {
      name: 'no-dead-core-pkgs',
      severity: 'error',
      comment:
        'Core has collapsed into `pillars/core/` — `@pops/core-db`, `@pops/core-contract`, and `@pops/core-api` are the retirement tombstone (deleted in the 02 decommission). No new code may import them; consumers go through `@pops/core` (contract types + api-types + openapi) and the core REST API for cross-pillar calls.',
      from: { path: '.*' },
      to: { path: '^@pops/(core-db|core-contract|core-api)(/|$)' },
    },
    ...contractBoundaryRules,
  ],
  options: {
    doNotFollow: {
      path: ['node_modules', 'dist'],
    },
    exclude: {
      path: ['node_modules', 'build', '\\.next', 'coverage', '/migrations/', 'drizzle\\.config\\.'],
    },
    tsConfig: {
      fileName: 'tsconfig.base.json',
    },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
    reporterOptions: {
      text: {
        highlightFocused: true,
      },
    },
  },
};
