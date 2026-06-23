import { describe, expect, it } from 'vitest';

import {
  discoverCrates,
  findViolations,
  parseMemberManifest,
  parseWorkspaceMembers,
} from '../check-cargo-deps.mjs';

type Crate = Parameters<typeof findViolations>[0][number];

const pillar = (name: string, deps: string[] = []): Crate => ({
  dir: `pillars/${name}`,
  name,
  kind: 'pillar',
  deps,
});

const lib = (name: string, deps: string[] = []): Crate => ({
  dir: `libs/${name}`,
  name,
  kind: 'lib',
  deps,
});

describe('parseWorkspaceMembers', () => {
  it('reads a single-line members array', () => {
    const toml = `[workspace]
resolver = "2"
members = ["pillars/contacts", "libs/pops-ai", "libs/pops-settings"]`;
    expect(parseWorkspaceMembers(toml)).toEqual([
      'pillars/contacts',
      'libs/pops-ai',
      'libs/pops-settings',
    ]);
  });

  it('reads a multi-line members array', () => {
    const toml = `[workspace]
members = [
  "pillars/contacts",
  "libs/pops-ai",
]
[workspace.package]
edition = "2021"`;
    expect(parseWorkspaceMembers(toml)).toEqual(['pillars/contacts', 'libs/pops-ai']);
  });

  it('ignores members-like lines outside [workspace]', () => {
    const toml = `[package]
members = ["not-a-real-member"]
[workspace]
members = ["libs/x"]`;
    expect(parseWorkspaceMembers(toml)).toEqual(['libs/x']);
  });
});

describe('parseMemberManifest', () => {
  it('collects deps across dependencies / dev / build tables and resolves renames', () => {
    const toml = `[package]
name = "demo"
[dependencies]
axum = { workspace = true }
serde = "1"
[dev-dependencies]
tower = { version = "0.5" }
[build-dependencies]
cc = "1"
[target.'cfg(unix)'.dependencies]
nix = "0.27"`;
    const { name, deps } = parseMemberManifest(toml);
    expect(name).toBe('demo');
    expect(new Set(deps)).toEqual(new Set(['axum', 'serde', 'tower', 'cc', 'nix']));
  });

  it('resolves a renamed dependency to the real crate name', () => {
    const toml = `[package]
name = "demo"
[dependencies]
my-alias = { package = "real-crate", version = "1" }`;
    const { deps } = parseMemberManifest(toml);
    expect(deps).toContain('real-crate');
    expect(deps).not.toContain('my-alias');
  });

  it('does not mistake a commented-out dep for a real one', () => {
    const toml = `[package]
name = "demo"
[dependencies]
# contacts = { path = "../../pillars/contacts" }
serde = "1"`;
    const { deps } = parseMemberManifest(toml);
    expect(deps).toEqual(['serde']);
  });
});

describe('findViolations', () => {
  it('flags a lib that depends on a pillar (RUST-2a)', () => {
    const found = findViolations([pillar('contacts'), lib('pops-ai', ['contacts', 'serde'])]);
    expect(found).toEqual([{ from: 'pops-ai', fromKind: 'lib', to: 'contacts', rule: 'RUST-2a' }]);
  });

  it('flags a pillar that depends on another pillar (RUST-2b)', () => {
    const found = findViolations([pillar('contacts'), pillar('finance', ['contacts', 'axum'])]);
    expect(found).toEqual([
      { from: 'finance', fromKind: 'pillar', to: 'contacts', rule: 'RUST-2b' },
    ]);
  });

  it('does not flag a pillar self-edge or third-party deps', () => {
    const found = findViolations([
      pillar('contacts', ['contacts', 'axum', 'sqlx']),
      lib('pops-settings', ['serde', 'axum', 'utoipa']),
    ]);
    expect(found).toEqual([]);
  });

  it('catches multiple violations at once', () => {
    const found = findViolations([
      pillar('contacts'),
      pillar('finance', ['contacts']),
      lib('pops-ai', ['contacts']),
    ]);
    expect(found).toHaveLength(2);
    expect(found.map((v) => v.rule).toSorted()).toEqual(['RUST-2a', 'RUST-2b']);
  });
});

describe('discoverCrates (real workspace)', () => {
  it('classifies the live workspace as 1 pillar + 2 libs with no violations', () => {
    const crates = discoverCrates();
    const byKind = (k: string) =>
      crates
        .filter((c) => c.kind === k)
        .map((c) => c.name)
        .sort();
    expect(byKind('pillar')).toEqual(['contacts']);
    expect(byKind('lib')).toEqual(['pops-ai', 'pops-settings']);
    expect(findViolations(crates)).toEqual([]);
  });
});
