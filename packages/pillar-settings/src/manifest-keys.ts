/**
 * Derives a pillar's declared key set, default map, and sensitive-key
 * list from its settings manifest descriptors. The manifest is the single
 * authority for a pillar's keys (no central enum) — `deriveKeySet` is the
 * sole bridge between the declared UI fields and the RU+reset router that
 * gates them.
 *
 * The input type is the structural subset of
 * `SettingsManifestDescriptor` (`@pops/pillar-sdk/manifest-schema`) this
 * module actually reads, declared locally so the package stays decoupled
 * from the SDK while remaining assignable from the real descriptor.
 */

/** A single declared settings field — the structural subset used here. */
export interface DeclaredSettingsField {
  readonly key: string;
  readonly default?: string;
  readonly sensitive?: boolean;
}

/** A group of declared fields within a manifest descriptor. */
export interface DeclaredSettingsGroup {
  readonly fields: readonly DeclaredSettingsField[];
}

/** The structural subset of a settings manifest descriptor read here. */
export interface DeclaredSettingsManifest {
  readonly groups: readonly DeclaredSettingsGroup[];
}

/**
 * The resolved key authority for one pillar: the ordered declared keys,
 * the key→default map (only keys with an explicit manifest default), and
 * the sensitive-key list (redacted on read).
 */
export interface KeyDefaults {
  readonly keys: readonly string[];
  readonly defaults: Readonly<Record<string, string>>;
  readonly sensitive: readonly string[];
}

interface KeySetAccumulator {
  readonly keys: string[];
  readonly defaults: Record<string, string>;
  readonly sensitive: string[];
}

function collectField(acc: KeySetAccumulator, field: DeclaredSettingsField): void {
  acc.keys.push(field.key);
  if (field.default !== undefined) acc.defaults[field.key] = field.default;
  if (field.sensitive === true) acc.sensitive.push(field.key);
}

/**
 * Flattens a pillar's manifest descriptors into its {@link KeyDefaults}.
 * Iterates every group's fields in declaration order, collecting keys,
 * explicit defaults, and sensitive flags.
 */
export function deriveKeySet(manifests: readonly DeclaredSettingsManifest[]): KeyDefaults {
  const acc: KeySetAccumulator = { keys: [], defaults: {}, sensitive: [] };
  for (const manifest of manifests) {
    for (const group of manifest.groups) {
      for (const field of group.fields) collectField(acc, field);
    }
  }
  return { keys: acc.keys, defaults: acc.defaults, sensitive: acc.sensitive };
}

/**
 * Narrows a pillar's declared key list to the non-empty tuple
 * `makeSettingsContract` requires for its `:key` enum. The contract factory's
 * `KeyEnum extends [string, ...string[]]` bound cannot be satisfied by the
 * `readonly string[]` {@link deriveKeySet} yields, so this checks non-emptiness
 * at runtime and returns the same values under the precise type — a guarded
 * narrowing, not an unchecked widening.
 *
 * Throws if the key set is empty: a federated pillar with zero declared
 * settings keys cannot build a `z.enum`, and silently producing an empty enum
 * would be a latent boot failure.
 */
export function keyValuesFor(kd: KeyDefaults): [string, ...string[]] {
  const [first, ...rest] = kd.keys;
  if (first === undefined) {
    throw new Error('keyValuesFor: a federated pillar must declare at least one settings key');
  }
  return [first, ...rest];
}
