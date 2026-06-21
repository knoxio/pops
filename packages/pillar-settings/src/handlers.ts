import { UnknownSettingKeyError } from './errors.js';
import { redactSensitive, redactSensitiveMap } from './redact.js';
import {
  ensure,
  getBulk,
  getOrNull,
  listEffective,
  resetSetting,
  resetSettings,
  setBulk,
  setRaw,
  type ResetResult,
  type SettingEntry,
} from './service.js';

import type { KeyDefaults } from './manifest-keys.js';
import type { SettingRow, SettingsDb } from './schema.js';

/**
 * The identity gate, injected by the mounting pillar. Runs the same
 * authorization check the pillar's REST middleware uses; throws (e.g.
 * `UnauthorizedError`) when the principal lacks the scope. Kept generic
 * over the principal type so the package carries no identity dependency.
 */
export type SettingsGate<Principal> = (principal: Principal, scope: string) => void;

/** Dependencies a pillar injects to build its settings handlers. */
export interface SettingsHandlerDeps<Principal> {
  /** The pillar's drizzle settings database handle. */
  readonly db: SettingsDb;
  /** Scope prefix for the gate, e.g. `'finance.settings'`. */
  readonly scopePrefix: string;
  /** The pillar's derived key authority (keys, defaults, sensitive). */
  readonly keyDefaults: KeyDefaults;
  /** The injected identity gate. */
  readonly gate: SettingsGate<Principal>;
}

/**
 * The pure RU+reset handler logic for one pillar, decoupled from any
 * transport. Each method gates the principal, runs the service, and
 * redacts sensitive values on READ paths only. The mounting pillar wraps
 * these in its ts-rest adapter (principal extraction + error mapping).
 *
 * There is no create or delete handler — only read, update, reset, and
 * the internal-only `ensure` seed. WRITE/RESET paths reject keys outside
 * the declared set (`UnknownSettingKeyError`) so a batch write can never
 * become a backdoor create; READ paths stay lenient (an undeclared key is
 * simply absent), letting an aggregator query a superset without error.
 */
export interface SettingsHandlers<Principal> {
  list(principal: Principal): { data: SettingRow[] };
  get(principal: Principal, key: string): { data: SettingRow | null };
  getMany(principal: Principal, keys: readonly string[]): { settings: Record<string, string> };
  set(principal: Principal, key: string, value: string): { data: SettingRow; message: string };
  setMany(
    principal: Principal,
    entries: readonly SettingEntry[]
  ): { settings: Record<string, string> };
  resetKey(principal: Principal, key: string): { data: SettingRow; message: string };
  reset(principal: Principal, keys: readonly string[] | undefined): ResetResult;
  ensure(principal: Principal, key: string, value: string): { data: SettingRow };
}

/**
 * Builds the injected, pillar-agnostic RU+reset handlers. READ paths
 * (`list`/`get`/`getMany`) redact sensitive keys to the `__redacted__`
 * sentinel; UPDATE/RESET paths persist and return real values.
 */
export function makeSettingsHandlers<Principal>(
  deps: SettingsHandlerDeps<Principal>
): SettingsHandlers<Principal> {
  const { db, scopePrefix, keyDefaults, gate } = deps;
  const sensitive = new Set(keyDefaults.sensitive);
  const declared = new Set(keyDefaults.keys);
  const scope = (proc: string): string => `${scopePrefix}.${proc}`;
  const assertDeclared = (keys: readonly string[]): void => {
    const unknown = keys.filter((key) => !declared.has(key));
    if (unknown.length > 0) throw new UnknownSettingKeyError(unknown);
  };

  return {
    list(principal) {
      gate(principal, scope('list'));
      return { data: redactSensitive(listEffective(db, keyDefaults), sensitive) };
    },

    get(principal, key) {
      gate(principal, scope('get'));
      const row = getOrNull(db, key);
      if (row === null) return { data: null };
      const [redacted] = redactSensitive([row], sensitive);
      return { data: redacted ?? row };
    },

    getMany(principal, keys) {
      gate(principal, scope('getMany'));
      return { settings: redactSensitiveMap(getBulk(db, keys), sensitive) };
    },

    set(principal, key, value) {
      gate(principal, scope('set'));
      assertDeclared([key]);
      return { data: setRaw(db, key, value), message: 'Setting saved' };
    },

    setMany(principal, entries) {
      gate(principal, scope('setMany'));
      assertDeclared(entries.map((entry) => entry.key));
      return { settings: setBulk(db, entries) };
    },

    resetKey(principal, key) {
      gate(principal, scope('resetKey'));
      assertDeclared([key]);
      return { data: resetSetting(db, key, keyDefaults), message: 'Setting reset to default' };
    },

    reset(principal, keys) {
      gate(principal, scope('reset'));
      return resetSettings(db, keys, keyDefaults);
    },

    ensure(principal, key, value) {
      gate(principal, scope('ensure'));
      return { data: ensure(db, key, value) };
    },
  };
}
