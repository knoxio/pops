/**
 * Compile-time type tests for `ModuleManifest` and the PRD-101 cross-cutting
 * slots. This file is excluded from emit (`tsconfig.build.json`); it only
 * exercises the type system. A regression here is a TypeScript compiler error
 * surfaced by `pnpm typecheck` in CI.
 */
import type {
  AiToolDescriptor,
  Capability,
  IngestSourceDescriptor,
  MigrationDescriptor,
  ModuleManifest,
  SearchAdapterDescriptor,
  UriHandlerDescriptor,
  UriResolution,
} from './index.js';

/** Helper: assert a type is assignable to another, at compile time. */
type Expect<T extends true> = T;
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Assignable<A, B> = A extends B ? true : false;

/* -------------------------------------------------------------------------- */
/* Capability — typed-scope inference                                         */
/* -------------------------------------------------------------------------- */

// Default Capability is `${string}.${string}` — any namespaced string fits.
const _capDefault: Capability = 'finance.transaction.read';
const _capDefault2: Capability = 'media.movie.write';

// Narrowed to a single module id, only that namespace fits.
type FinanceCap = Capability<'finance'>;
const _capFinance: FinanceCap = 'finance.transaction.read';
// @ts-expect-error — wrong namespace must not type-check
const _capWrongNs: FinanceCap = 'media.movie.read';
// @ts-expect-error — must include a dot-separated scope
const _capNoDot: FinanceCap = 'finance';

// Narrowed to a union of module ids — produces a union of namespaces.
type CoreOrFinance = Capability<'core' | 'finance'>;
type _ExpectCoreOrFinance = Expect<Equal<CoreOrFinance, `core.${string}` | `finance.${string}`>>;
const _capCore: CoreOrFinance = 'core.entity.read';
const _capFin: CoreOrFinance = 'finance.budget.write';
// @ts-expect-error — module not in the union
const _capOutside: CoreOrFinance = 'media.movie.read';

/* -------------------------------------------------------------------------- */
/* MODULES id-union narrowing — simulated until US-02 ships                   */
/* -------------------------------------------------------------------------- */

// Simulates the PRD-101 US-02 generated `MODULES` constant. The id literal
// flows through to give `Capability` a concrete namespace union.
const SIMULATED_MODULES = [
  { id: 'finance', name: 'Finance', surfaces: ['app'] as const },
  { id: 'media', name: 'Media', surfaces: ['app'] as const },
] as const;

type SimulatedModuleId = (typeof SIMULATED_MODULES)[number]['id'];
type _ExpectIdUnion = Expect<Equal<SimulatedModuleId, 'finance' | 'media'>>;

type SimulatedCapability = Capability<SimulatedModuleId>;
const _simCapOk: SimulatedCapability = 'finance.transaction.read';
const _simCapOk2: SimulatedCapability = 'media.movie.read';
// @ts-expect-error — module id outside the union
const _simCapBad: SimulatedCapability = 'inventory.item.read';

/* -------------------------------------------------------------------------- */
/* Descriptor optionality                                                     */
/* -------------------------------------------------------------------------- */

// A minimal manifest must compile — every cross-cutting slot is optional.
const _minimal: ModuleManifest = {
  id: 'finance',
  name: 'Finance',
  surfaces: ['app'],
};

// A maximal manifest exercises every PRD-101 slot.
const _maximal: ModuleManifest = {
  id: 'finance',
  name: 'Finance',
  version: '0.1.0',
  surfaces: ['app'],
  description: 'desc',
  dependsOn: ['core'],
  capabilities: ['finance.transaction.read', 'finance.budget.write'],
  features: [{ id: 'finance', title: 'Finance', order: 10, features: [] }],
  search: [
    {
      domain: 'finance',
      icon: 'wallet',
      color: 'green',
      search: () => [],
    },
  ],
  uriHandler: {
    types: ['transaction'],
    resolve: async () => ({ kind: 'not-found' }),
  },
  backend: {
    router: {},
    aiTools: [
      {
        name: 'finance.transaction.find',
        description: 'Find transactions',
        inputSchema: { type: 'object' },
        handler: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
      },
    ],
    migrations: [{ id: '2026_05_11_001_finance_init', sql: 'SELECT 1' }],
    ingestSources: [{ id: 'plaid', label: 'Plaid' }],
  },
};

// Slots are individually omittable — TypeScript should not require any of them.
const _onlyCapabilities: ModuleManifest = {
  id: 'finance',
  name: 'Finance',
  surfaces: ['app'],
  capabilities: ['finance.x'],
};

// Covers `_minimal` and `_maximal` use to keep the linter quiet about unused vars.
type _UseAll = [
  typeof _capDefault,
  typeof _capDefault2,
  typeof _capFinance,
  typeof _capCore,
  typeof _capFin,
  typeof _simCapOk,
  typeof _simCapOk2,
  typeof _minimal,
  typeof _maximal,
  typeof _onlyCapabilities,
];

/* -------------------------------------------------------------------------- */
/* UriResolution — discriminated union narrows on `kind`                      */
/* -------------------------------------------------------------------------- */

declare const _resolution: UriResolution<{ id: string }>;
if (_resolution.kind === 'object') {
  // `data` is reachable only on the `object` branch.
  const _id: string = _resolution.data.id;
  void _id;
}

/* -------------------------------------------------------------------------- */
/* Descriptor shapes are exported and structurally distinct                   */
/* -------------------------------------------------------------------------- */

type _AssignAiTool = Expect<
  Assignable<
    {
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
      handler: (i: Record<string, unknown>) => Promise<{
        content: readonly { type: 'text'; text: string }[];
      }>;
    },
    AiToolDescriptor
  >
>;

type _AssignMigration = Expect<Assignable<{ id: string; sql: string }, MigrationDescriptor>>;
type _AssignSearch = Expect<Assignable<SearchAdapterDescriptor, SearchAdapterDescriptor>>;
type _AssignUri = Expect<Assignable<UriHandlerDescriptor, UriHandlerDescriptor>>;
type _AssignIngest = Expect<Assignable<{ id: string; label: string }, IngestSourceDescriptor>>;
