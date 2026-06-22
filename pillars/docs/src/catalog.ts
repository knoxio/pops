/**
 * Catalog builder for pops-docs (Theme 13 PRD-219).
 *
 * Separated from `scripts/collect-specs.ts` so the transformation from
 * "list of contract package directories" → "Stoplight Elements catalog"
 * is testable without the filesystem walk or git invocation.
 */

export interface ContractPackageJson {
  readonly name: string;
  readonly version: string;
}

export interface OpenApiInfo {
  readonly title?: string;
  readonly version?: string;
  readonly description?: string;
}

export interface OpenApiSnapshot {
  readonly info?: OpenApiInfo;
}

export interface CollectedContract {
  readonly id: string;
  readonly packageName: string;
  readonly packageVersion: string;
  readonly sourcePath: string;
  readonly snapshot: OpenApiSnapshot;
}

export interface CatalogContract {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly openapiPath: string;
  readonly registryPillarId: string;
  readonly contractTag: string;
}

export interface Catalog {
  readonly generatedAt: string;
  readonly contracts: readonly CatalogContract[];
}

export interface BuildCatalogInput {
  readonly generatedAt: string;
  readonly contracts: readonly CollectedContract[];
}

/**
 * `info.title` from the OpenAPI snapshot is human-friendly when present;
 * otherwise fall back to the contract id capitalised so the sidebar in
 * Stoplight Elements stays readable for in-flight contracts that have
 * not customised their title yet.
 */
function displayName(contract: CollectedContract): string {
  const fromSpec = contract.snapshot.info?.title?.trim();
  if (fromSpec && fromSpec.length > 0) return fromSpec;
  return contract.id.charAt(0).toUpperCase() + contract.id.slice(1);
}

/**
 * Prefer the OpenAPI snapshot's `info.version` (the contract package's
 * own `package.json` version is what feeds it via the generator) and
 * fall back to the raw package.json version if a hand-rolled snapshot
 * happens to omit it.
 */
function displayVersion(contract: CollectedContract): string {
  const fromSpec = contract.snapshot.info?.version?.trim();
  if (fromSpec && fromSpec.length > 0) return fromSpec;
  return contract.packageVersion;
}

export function buildCatalog(input: BuildCatalogInput): Catalog {
  const contracts = input.contracts.map<CatalogContract>((contract) => {
    const version = displayVersion(contract);
    return {
      id: contract.id,
      name: displayName(contract),
      version,
      openapiPath: `/openapi/${contract.id}.json`,
      registryPillarId: contract.id,
      contractTag: `contract-${contract.id}@v${version}`,
    };
  });

  return { generatedAt: input.generatedAt, contracts };
}
