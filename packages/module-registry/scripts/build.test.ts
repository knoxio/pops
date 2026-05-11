/**
 * Build-time contract violation matrix (PRD-101 US-11).
 *
 * Layered on top of `lib.test.ts` (which exercises each validator in isolation),
 * this file enforces the user-facing contract surface of `pnpm registry:build`
 * end-to-end via `buildRegistrySource`. Every failure mode listed in the
 * "Edge Cases" table of the PRD has a corresponding assertion here so a
 * regression that papers over the error message — rather than the underlying
 * check — still trips this matrix.
 *
 * Goals:
 *   - Every failure message names the offending module id(s) (operators must
 *     never have to grep manifests to figure out who broke the build).
 *   - Cross-manifest invariants (uniqueness, dependsOn, URI/AI tool collisions)
 *     are enforced before `generated.ts` is emitted; the source string is
 *     never produced for an invalid input.
 */
import { describe, expect, it } from 'vitest';

import { buildRegistrySource, validateManifests } from './lib.js';

import type { ModuleManifest } from '@pops/types';

const ALL_KNOWN = ['a', 'b', 'c'] as const;

describe('build-time contract violations', () => {
  describe('missing required fields', () => {
    it('fails with a message naming `id` when the slot is empty', () => {
      const bad: readonly unknown[] = [{ id: '', name: 'X', surfaces: ['app'] }];
      expect(() => buildRegistrySource(bad as readonly ModuleManifest[], ALL_KNOWN, {})).toThrow(
        /'id' must be a non-empty string/
      );
    });

    it('fails with a message naming `id` when the slot is missing entirely', () => {
      const bad: readonly unknown[] = [{ name: 'X', surfaces: ['app'] }];
      expect(() => buildRegistrySource(bad as readonly ModuleManifest[], ALL_KNOWN, {})).toThrow(
        /'id' must be a non-empty string/
      );
    });

    it('fails with a message naming `name` when the slot is empty', () => {
      const bad: readonly unknown[] = [{ id: 'a', name: '', surfaces: ['app'] }];
      expect(() => buildRegistrySource(bad as readonly ModuleManifest[], ALL_KNOWN, {})).toThrow(
        /'name' must be a non-empty string/
      );
    });
  });

  describe('dangling dependsOn', () => {
    it('fails naming the dependent module and the missing target', () => {
      const manifests: readonly ModuleManifest[] = [
        { id: 'a', name: 'A', surfaces: ['app'], dependsOn: ['ghost'] },
      ];
      try {
        validateManifests(manifests);
        throw new Error('expected validateManifests to throw');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Both the dependent module id and the absent target must appear so
        // operators can locate the offending manifest without grepping.
        expect(message).toContain("'a'");
        expect(message).toContain("'ghost'");
      }
    });

    it('passes when dependsOn references another manifest in the install set', () => {
      const manifests: readonly ModuleManifest[] = [
        { id: 'a', name: 'A', surfaces: ['app'] },
        { id: 'b', name: 'B', surfaces: ['app'], dependsOn: ['a'] },
      ];
      expect(() => validateManifests(manifests)).not.toThrow();
    });
  });

  describe('uriHandler type collisions', () => {
    it('fails naming both modules that claim the same type', () => {
      const handler = async () => ({ kind: 'not-found' as const });
      const manifests: readonly ModuleManifest[] = [
        {
          id: 'a',
          name: 'A',
          surfaces: ['app'],
          uriHandler: { types: ['thing'], resolve: handler },
        },
        {
          id: 'b',
          name: 'B',
          surfaces: ['app'],
          uriHandler: { types: ['thing'], resolve: handler },
        },
      ];

      try {
        validateManifests(manifests);
        throw new Error('expected validateManifests to throw');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        expect(message).toContain("'thing'");
        expect(message).toContain("'a'");
        expect(message).toContain("'b'");
      }
    });

    it('allows the same module to declare the type twice (idempotent)', () => {
      const handler = async () => ({ kind: 'not-found' as const });
      const manifests: readonly ModuleManifest[] = [
        {
          id: 'a',
          name: 'A',
          surfaces: ['app'],
          uriHandler: { types: ['thing', 'thing'], resolve: handler },
        },
      ];
      expect(() => validateManifests(manifests)).not.toThrow();
    });
  });

  describe('aiTools name collisions', () => {
    it('fails naming both modules that declare the same tool name', () => {
      const handler = async () => ({ content: [{ type: 'text' as const, text: '' }] });
      const manifests: readonly ModuleManifest[] = [
        {
          id: 'a',
          name: 'A',
          surfaces: ['app'],
          backend: {
            router: {},
            aiTools: [{ name: 'shared.do', description: '...', inputSchema: {}, handler }],
          },
        },
        {
          id: 'b',
          name: 'B',
          surfaces: ['app'],
          backend: {
            router: {},
            aiTools: [{ name: 'shared.do', description: '...', inputSchema: {}, handler }],
          },
        },
      ];

      try {
        validateManifests(manifests);
        throw new Error('expected validateManifests to throw');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        expect(message).toContain("'shared.do'");
        expect(message).toContain("'a'");
        expect(message).toContain("'b'");
      }
    });
  });

  describe('duplicate ids', () => {
    it('fails on duplicate `id` across two manifests', () => {
      const manifests: readonly ModuleManifest[] = [
        { id: 'a', name: 'A', surfaces: ['app'] },
        { id: 'a', name: 'A duplicate', surfaces: ['app'] },
      ];
      expect(() => validateManifests(manifests)).toThrow(/duplicate module id 'a'/);
    });

    it('fails before `generated.ts` source is emitted', () => {
      const manifests: readonly ModuleManifest[] = [
        { id: 'a', name: 'A', surfaces: ['app'] },
        { id: 'a', name: 'A duplicate', surfaces: ['app'] },
      ];
      expect(() => buildRegistrySource(manifests, ALL_KNOWN, {})).toThrow(/duplicate module id/);
    });
  });

  describe('contract is enforced end-to-end via buildRegistrySource', () => {
    it('does not emit source when validation fails', () => {
      const manifests: readonly ModuleManifest[] = [
        { id: 'a', name: 'A', surfaces: ['app'], dependsOn: ['ghost'] },
      ];
      // Any throw is acceptable; the assertion that matters is that no
      // partial / invalid source escapes to the consumer.
      let source: string | undefined;
      try {
        ({ source } = buildRegistrySource(manifests, ALL_KNOWN, {}));
      } catch {
        source = undefined;
      }
      expect(source).toBeUndefined();
    });
  });
});
