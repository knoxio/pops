/**
 * Domain errors raised by the plexus data-access service.
 *
 * Kept in their own module so callers can `instanceof`-check without
 * pulling in the SQL seam, and so the error surface stays stable while
 * the service internals evolve.
 */

/** Adapter id was not present in `plexus_adapters` when one was required. */
export class PlexusAdapterNotFoundError extends Error {
  readonly adapterId: string;
  constructor(adapterId: string) {
    super(`Plexus adapter '${adapterId}' not found`);
    this.name = 'PlexusAdapterNotFoundError';
    this.adapterId = adapterId;
  }
}

/**
 * Adapter `name` is unique; raised when a fresh row collides with an
 * existing adapter (typically because a TOML file pointed at the same
 * registry slot under a different id).
 */
export class PlexusAdapterNameConflictError extends Error {
  readonly adapterName: string;
  constructor(adapterName: string) {
    super(`Plexus adapter name '${adapterName}' already registered`);
    this.name = 'PlexusAdapterNameConflictError';
    this.adapterName = adapterName;
  }
}
