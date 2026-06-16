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
