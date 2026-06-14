/**
 * Runtime externals registry (PRD-242 US-02 / PRD-228 surface).
 *
 * Holds the orchestrator's in-process view of `origin: 'external'` pillars
 * registered at runtime via PRD-228's HTTP register / deregister endpoints.
 * It is intentionally a thin in-memory cache distinct from the persisted
 * `pillar_registry` table — the table is the source of truth across
 * restarts, this registry is the source of truth for the live `appRouter`
 * composition between restarts.
 *
 * The registry emits `changed` events. The runtime router composition
 * (`./compose.ts`) listens, debounces, and recomposes. Future PRD-228 HTTP
 * route handlers call `registerExternal` / `deregisterExternal` on this
 * module after persisting to the DB.
 *
 * Pillar-id collisions with in-repo (codegen) router ids are rejected at
 * `register` time per PRD-228 reserved-id rules. The codegen id set is
 * injected at construction so the registry is decoupled from any specific
 * catalogue (testability).
 */
import { EventEmitter } from 'node:events';

export interface ExternalPillarEntry {
  readonly pillarId: string;
  readonly baseUrl: string;
}

export interface ExternalsRegistry {
  list(): readonly ExternalPillarEntry[];
  register(entry: ExternalPillarEntry): void;
  deregister(pillarId: string): boolean;
  onChange(listener: () => void): () => void;
  clear(): void;
}

export class PillarIdCollisionError extends Error {
  constructor(public readonly pillarId: string) {
    super(
      `External pillar id '${pillarId}' collides with a reserved in-repo router id. ` +
        `Per PRD-228, external pillars cannot shadow in-tree pillars.`
    );
    this.name = 'PillarIdCollisionError';
  }
}

export function createExternalsRegistry(reservedIds: ReadonlySet<string>): ExternalsRegistry {
  const entries = new Map<string, ExternalPillarEntry>();
  const emitter = new EventEmitter();

  return {
    list(): readonly ExternalPillarEntry[] {
      return [...entries.values()].toSorted((a, b) => {
        if (a.pillarId < b.pillarId) return -1;
        if (a.pillarId > b.pillarId) return 1;
        return 0;
      });
    },
    register(entry: ExternalPillarEntry): void {
      if (reservedIds.has(entry.pillarId)) {
        throw new PillarIdCollisionError(entry.pillarId);
      }
      entries.set(entry.pillarId, entry);
      emitter.emit('changed');
    },
    deregister(pillarId: string): boolean {
      const removed = entries.delete(pillarId);
      if (removed) emitter.emit('changed');
      return removed;
    },
    onChange(listener: () => void): () => void {
      emitter.on('changed', listener);
      return () => {
        emitter.off('changed', listener);
      };
    },
    clear(): void {
      const hadEntries = entries.size > 0;
      entries.clear();
      if (hadEntries) emitter.emit('changed');
    },
  };
}
