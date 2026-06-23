import { describe, expect, it } from 'vitest';

import { rewriteManifest } from '../cargo-extract.mjs';

const ROOT = `[workspace]
resolver = "2"
members = ["pillars/contacts", "libs/pops-ai"]

[workspace.package]
edition = "2021"
license = "UNLICENSED"
publish = false

[workspace.dependencies]
serde = { version = "1", features = ["derive"] }
tokio = { version = "1", features = ["rt-multi-thread", "macros", "signal"] }
anyhow = "1"`;

describe('rewriteManifest', () => {
  it('inlines [workspace.package] inheritance', () => {
    const member = `[package]
name = "demo"
edition.workspace = true
license.workspace = true
publish.workspace = true`;
    const out = rewriteManifest(member, ROOT);
    expect(out).toContain('edition = "2021"');
    expect(out).toContain('license = "UNLICENSED"');
    expect(out).toContain('publish = false');
    expect(out).not.toContain('.workspace = true');
  });

  it('resolves a string-form workspace dep to its pinned version', () => {
    const member = `[package]
name = "demo"
[dependencies]
anyhow = { workspace = true }`;
    const out = rewriteManifest(member, ROOT);
    expect(out).toContain('anyhow = { version = "1" }');
  });

  it('resolves a table-form workspace dep preserving its features', () => {
    const member = `[package]
name = "demo"
[dependencies]
serde = { workspace = true }`;
    const out = rewriteManifest(member, ROOT);
    expect(out).toContain('serde = { version = "1", features = ["derive"] }');
  });

  it('unions member-local features onto the workspace base features', () => {
    const member = `[package]
name = "demo"
[dev-dependencies]
tokio = { workspace = true, features = ["test-util"] }`;
    const out = rewriteManifest(member, ROOT);
    const line = out.split('\n').find((l) => l.startsWith('tokio = '));
    expect(line).toBeDefined();
    for (const f of ['rt-multi-thread', 'macros', 'signal', 'test-util']) {
      expect(line).toContain(`"${f}"`);
    }
    expect(line).not.toContain('workspace = true');
  });

  it('drops the package→workspace pointer and roots the crate with [workspace]', () => {
    const member = `[package]
name = "demo"
workspace = "../.."
edition.workspace = true`;
    const out = rewriteManifest(member, ROOT);
    expect(out).not.toContain('workspace = "../.."');
    expect(out.trimEnd().endsWith('[workspace]')).toBe(true);
  });

  it('throws if a workspace=true dep is missing from [workspace.dependencies]', () => {
    const member = `[package]
name = "demo"
[dependencies]
ghost = { workspace = true }`;
    expect(() => rewriteManifest(member, ROOT)).toThrow(/ghost/u);
  });

  it('leaves a non-workspace pinned dep untouched', () => {
    const member = `[package]
name = "demo"
[dev-dependencies]
tower = { version = "0.5", features = ["util"] }`;
    const out = rewriteManifest(member, ROOT);
    expect(out).toContain('tower = { version = "0.5", features = ["util"] }');
  });
});
