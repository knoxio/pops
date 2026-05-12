/**
 * Runtime install-set contract matrix (PRD-101 US-11).
 *
 * Why an override instead of regenerating `MODULES`: `MODULES` is `as const`
 * literal data emitted at registry build time, so per-case mutation is not
 * possible without a separate build. The override targets the in-process
 * aggregators only; search-adapter aggregation (which joins through
 * `isModuleId` on `MODULES` itself) is covered separately.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { listTools } from '../mcp/tools/index.js';
import { setupTestContext } from '../shared/test-utils.js';
import { getFeatureManifests, isEnabled } from './core/features/service.js';
import { resolveUri } from './core/uri/resolver.js';
import {
  __resetInstalledManifestsOverride,
  __setInstalledManifestsOverride,
} from './installed-modules.js';
import { getBackendManifests } from './manifests.js';

import type {
  AiToolDescriptor,
  FeatureManifest,
  ModuleManifest,
  SettingsManifest,
  UriHandlerDescriptor,
} from '@pops/types';

/**
 * Synthetic manifest factory. Avoids touching the real domain modules so the
 * matrix is hermetic — production manifests can change shape and this test
 * stays green as long as the contract surface is preserved.
 */
interface ManifestSpec {
  id: string;
  surfaces?: readonly ('app' | 'overlay')[];
  settings?: SettingsManifest;
  features?: FeatureManifest;
  uriHandler?: UriHandlerDescriptor;
  aiTool?: AiToolDescriptor;
  overlayChromeSlot?: string;
}

function makeManifest(spec: ManifestSpec): ModuleManifest {
  const surfaces = spec.surfaces ?? ['app'];
  const m: ModuleManifest = {
    id: spec.id,
    name: spec.id,
    surfaces,
  };
  if (spec.settings) m.settings = [spec.settings];
  if (spec.features) m.features = [spec.features];
  if (spec.uriHandler) m.uriHandler = spec.uriHandler;
  if (spec.aiTool) {
    m.backend = { router: {}, aiTools: [spec.aiTool] };
  }
  if (spec.overlayChromeSlot) {
    m.frontend = { overlay: { chromeSlot: spec.overlayChromeSlot } };
  }
  return m;
}

/** Settings manifest stub with one trivial group. */
function makeSettings(moduleId: string): SettingsManifest {
  return {
    id: `${moduleId}.section`,
    title: `${moduleId} settings`,
    order: 1,
    groups: [{ id: 'g', title: 'g', fields: [] }],
  };
}

/** Feature manifest stub with one system-scoped feature. */
function makeFeatureManifest(moduleId: string): FeatureManifest {
  return {
    id: moduleId,
    title: `${moduleId} features`,
    order: 1,
    features: [
      {
        key: `${moduleId}.flag`,
        label: 'Flag',
        default: false,
        scope: 'system',
      },
    ],
  };
}

function makeUriHandler(type: string): UriHandlerDescriptor {
  return {
    types: [type],
    resolve: async () => ({ kind: 'object', data: { type } }),
  };
}

function makeAiTool(name: string): AiToolDescriptor {
  return {
    name,
    description: `tool ${name}`,
    inputSchema: { type: 'object', properties: {} },
    handler: vi.fn(async () => ({
      content: [{ type: 'text' as const, text: `result:${name}` }],
    })),
  };
}

/**
 * Build the canonical manifest for one of the test "domain" modules. Each
 * module declares every cross-cutting slot so the matrix can assert presence
 * / absence per consumer in a single pass.
 */
function makeDomainManifest(id: string): ModuleManifest {
  return makeManifest({
    id,
    settings: makeSettings(id),
    features: makeFeatureManifest(id),
    uriHandler: makeUriHandler(`${id}-thing`),
    aiTool: makeAiTool(`${id}.tool`),
  });
}

function makeOverlayManifest(id: string): ModuleManifest {
  return makeManifest({
    id,
    surfaces: ['overlay', 'app'],
    overlayChromeSlot: 'assistant',
    aiTool: makeAiTool(`${id}.tool`),
  });
}

// ---------------------------------------------------------------------------
// Install sets

interface InstallSet {
  label: string;
  manifests: readonly ModuleManifest[];
  /** Module ids the resolver should treat as installed. */
  installed: ReadonlySet<string>;
  /** Subset of `installed` whose manifests declare an overlay surface. */
  overlayIds: ReadonlySet<string>;
}

function allModules(): InstallSet {
  const finance = makeDomainManifest('finance');
  const media = makeDomainManifest('media');
  const inventory = makeDomainManifest('inventory');
  const ego = makeOverlayManifest('ego');
  return {
    label: 'all-modules',
    manifests: [finance, media, inventory, ego],
    installed: new Set(['finance', 'media', 'inventory', 'ego']),
    overlayIds: new Set(['ego']),
  };
}

function financeOnly(): InstallSet {
  const finance = makeDomainManifest('finance');
  return {
    label: 'finance-only',
    manifests: [finance],
    installed: new Set(['finance']),
    overlayIds: new Set(),
  };
}

function noOverlays(): InstallSet {
  const finance = makeDomainManifest('finance');
  const media = makeDomainManifest('media');
  const inventory = makeDomainManifest('inventory');
  return {
    label: 'no-overlays',
    manifests: [finance, media, inventory],
    installed: new Set(['finance', 'media', 'inventory']),
    overlayIds: new Set(),
  };
}

const INSTALL_SETS: readonly InstallSet[] = [allModules(), financeOnly(), noOverlays()];

// ---------------------------------------------------------------------------
// Matrix

describe.each(INSTALL_SETS)('install-set $label', (set) => {
  const ctx = setupTestContext();

  beforeEach(() => {
    ctx.setup();
    __setInstalledManifestsOverride(set.manifests);
  });

  afterEach(() => {
    __resetInstalledManifestsOverride();
    ctx.teardown();
  });

  // -------------------------------------------------------------------------
  // Backend manifests consumer
  //
  // Settings filtering is now compile-time: `MODULES.flatMap(m => m.settings ?? [])`
  // emits only installed modules' sections after `pnpm registry:build`. The
  // matrix-level invariant ("absent modules cannot leak sections") is covered
  // by `packages/module-registry/scripts/lib.test.ts`.

  it('backend manifests aggregator matches the install set exactly', () => {
    const ids = getBackendManifests().map((m) => m.id);
    expect(new Set(ids)).toEqual(new Set(set.manifests.map((m) => m.id)));
  });

  // -------------------------------------------------------------------------
  // Features consumer

  it('feature manifests aggregator returns only installed modules features', () => {
    const features = getFeatureManifests();
    const expected = set.manifests.flatMap((m) => m.features ?? []);
    expect(features.length).toBe(expected.length);
    for (const f of expected) {
      expect(features).toContainEqual(f);
    }
  });

  it('isEnabled resolves keys declared by an installed module', () => {
    for (const m of set.manifests) {
      const feature = m.features?.[0]?.features[0];
      if (!feature) continue;
      // Default is `false`; we only assert the call does not throw.
      expect(isEnabled(feature.key)).toBe(false);
    }
  });

  it('isEnabled throws on keys declared by an absent module', () => {
    const absent = ['finance', 'media', 'inventory', 'ego'].find((id) => !set.installed.has(id));
    if (absent === undefined) return; // all-modules: nothing absent to test
    expect(() => isEnabled(`${absent}.flag`)).toThrow();
  });

  // -------------------------------------------------------------------------
  // AI tool consumer

  it('AI tool aggregator lists only installed-module tools', () => {
    const names = listTools().map((t) => t.name);
    const expected = set.manifests.flatMap((m) => (m.backend?.aiTools ?? []).map((t) => t.name));
    expect(names.toSorted()).toEqual(expected.toSorted());
  });

  it('AI tool aggregator does not surface absent-module tools', () => {
    const absent = ['finance', 'media', 'inventory', 'ego'].find((id) => !set.installed.has(id));
    if (absent === undefined) return;
    const names = listTools().map((t) => t.name);
    expect(names).not.toContain(`${absent}.tool`);
  });

  // -------------------------------------------------------------------------
  // URI resolver consumer

  it('URI resolver returns module-absent for owners outside the install set', async () => {
    const absent = ['finance', 'media', 'inventory', 'ego'].find((id) => !set.installed.has(id));
    if (absent === undefined) return;
    const result = await resolveUri(`pops:${absent}/${absent}-thing/x`, {
      registry: set.manifests,
      isInstalled: (id) => set.installed.has(id),
    });
    expect(result).toEqual({ kind: 'module-absent', moduleId: absent });
  });

  it('URI resolver dispatches to installed modules', async () => {
    for (const m of set.manifests) {
      if (!m.uriHandler) continue;
      const [type] = m.uriHandler.types;
      if (type === undefined) continue;
      const result = await resolveUri(`pops:${m.id}/${type}/x`, {
        registry: set.manifests,
        isInstalled: (id) => set.installed.has(id),
      });
      expect(result.kind).toBe('object');
      if (result.kind === 'object') {
        expect(result.moduleId).toBe(m.id);
        expect(result.type).toBe(type);
      }
    }
  });

  // -------------------------------------------------------------------------
  // Overlay surface

  it('overlay slot declarations match the overlay subset of the install set', () => {
    const overlays = set.manifests.filter((m) => m.surfaces.includes('overlay')).map((m) => m.id);
    expect(new Set(overlays)).toEqual(set.overlayIds);
  });
});

// ---------------------------------------------------------------------------
// Cross-set invariants — properties that must hold for *every* install set.

describe('cross-install-set invariants', () => {
  const ctx = setupTestContext();

  beforeEach(() => {
    ctx.setup();
  });

  afterEach(() => {
    __resetInstalledManifestsOverride();
    ctx.teardown();
  });

  it('absent-module URI grammar is uniform across install sets', async () => {
    for (const set of INSTALL_SETS) {
      __setInstalledManifestsOverride(set.manifests);
      const result = await resolveUri('pops:not-installed/widget/1', {
        registry: set.manifests,
        isInstalled: (id) => set.installed.has(id),
      });
      expect(result).toEqual({ kind: 'module-absent', moduleId: 'not-installed' });
    }
  });

  it('malformed URI surfaces are uniform across install sets', async () => {
    for (const set of INSTALL_SETS) {
      __setInstalledManifestsOverride(set.manifests);
      const result = await resolveUri('not-a-uri', {
        registry: set.manifests,
        isInstalled: (id) => set.installed.has(id),
      });
      expect(result.kind).toBe('malformed');
    }
  });
});
