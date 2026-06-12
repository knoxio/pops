/**
 * Zod-surface diff classifier.
 *
 * Inputs are the JSON Schema documents emitted by `extract-zod.ts`.
 * Classification rules (PRD-154 business rules):
 *
 *   Breaking (any of):
 *     - a top-level schema is removed.
 *     - a required object property is added.
 *     - an optional object property is made required.
 *     - an object property is removed.
 *     - a property's `type` changes.
 *     - an enum value is removed.
 *     - a union member is removed.
 *     - a numeric range narrows (minimum raised or maximum lowered).
 *     - a string pattern tightens (gain a pattern, or a different pattern).
 *
 *   Additive (any of, none of the above):
 *     - a top-level schema added.
 *     - a new optional object property.
 *     - a new enum value.
 *     - a new union member.
 *     - a widened numeric range.
 *
 * Anything we cannot classify confidently as additive is treated as
 * breaking — safer to over-report than to ship a silent break. The
 * adversarial bias is explicit in the test suite.
 */
import type { ChangedEntry, SurfaceDiff, ZodSurface, ZodSurfaceEntry } from './types.js';

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };

interface NodeDiff {
  readonly breaking: readonly string[];
  readonly additive: readonly string[];
}

interface DiffAcc {
  readonly breaking: string[];
  readonly additive: string[];
}

function isObj(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asObj(value: unknown): JsonObject | null {
  return isObj(value) ? value : null;
}

function asArray(value: unknown): readonly JsonValue[] | null {
  return Array.isArray(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function indexBy(surface: ZodSurface): Map<string, ZodSurfaceEntry> {
  const out = new Map<string, ZodSurfaceEntry>();
  for (const e of surface.entries) out.set(e.name, e);
  return out;
}

function pushAll(target: string[], path: string, items: readonly string[]): void {
  for (const item of items) target.push(`${path}: ${item}`);
}

function diffNode(baseline: JsonObject, current: JsonObject, path: string): NodeDiff {
  const acc: DiffAcc = { breaking: [], additive: [] };

  const baselineType = asString(baseline['type']);
  const currentType = asString(current['type']);
  if (baselineType !== null && currentType !== null && baselineType !== currentType) {
    acc.breaking.push(`type changed (${baselineType} → ${currentType})`);
    return acc;
  }

  diffEnum(baseline, current, acc);
  diffObjectShape(baseline, current, path, acc);
  diffArray(baseline, current, path, acc);
  diffUnion(baseline, current, path, acc);
  diffNumericRange(baseline, current, acc);
  diffStringConstraints(baseline, current, acc);

  return acc;
}

function diffEnum(baseline: JsonObject, current: JsonObject, acc: DiffAcc): void {
  const baselineEnum = asArray(baseline['enum']);
  const currentEnum = asArray(current['enum']);
  if (!baselineEnum || !currentEnum) return;
  const baseSet = new Set(baselineEnum.map((v) => JSON.stringify(v)));
  const curSet = new Set(currentEnum.map((v) => JSON.stringify(v)));
  for (const v of baseSet) {
    if (!curSet.has(v)) acc.breaking.push(`enum value removed (${v})`);
  }
  for (const v of curSet) {
    if (!baseSet.has(v)) acc.additive.push(`enum value added (${v})`);
  }
}

function diffObjectShape(
  baseline: JsonObject,
  current: JsonObject,
  path: string,
  acc: DiffAcc
): void {
  const { breaking, additive } = acc;
  const baselineProps = asObj(baseline['properties']);
  const currentProps = asObj(current['properties']);
  if (!baselineProps && !currentProps) return;

  const baseRequired = new Set((asArray(baseline['required']) ?? []).map(String));
  const curRequired = new Set((asArray(current['required']) ?? []).map(String));

  const baseProps = baselineProps ?? {};
  const curProps = currentProps ?? {};

  for (const name of Object.keys(baseProps)) {
    if (!(name in curProps)) {
      breaking.push(`property removed (${name})`);
      continue;
    }
    if (baseRequired.has(name) && !curRequired.has(name)) {
      additive.push(`property made optional (${name})`);
    }
    if (!baseRequired.has(name) && curRequired.has(name)) {
      breaking.push(`property made required (${name})`);
    }
    const childBase = asObj(baseProps[name]);
    const childCur = asObj(curProps[name]);
    if (childBase && childCur) {
      const child = diffNode(childBase, childCur, `${path}.${name}`);
      pushAll(breaking, `${path}.${name}`, child.breaking);
      pushAll(additive, `${path}.${name}`, child.additive);
    }
  }

  for (const name of Object.keys(curProps)) {
    if (name in baseProps) continue;
    if (curRequired.has(name)) {
      breaking.push(`required property added (${name})`);
    } else {
      additive.push(`optional property added (${name})`);
    }
  }
}

function diffArray(baseline: JsonObject, current: JsonObject, path: string, acc: DiffAcc): void {
  const baseItems = asObj(baseline['items']);
  const curItems = asObj(current['items']);
  if (!baseItems || !curItems) return;
  const child = diffNode(baseItems, curItems, `${path}[]`);
  pushAll(acc.breaking, `${path}[]`, child.breaking);
  pushAll(acc.additive, `${path}[]`, child.additive);
}

function diffUnion(baseline: JsonObject, current: JsonObject, path: string, acc: DiffAcc): void {
  const { breaking, additive } = acc;
  for (const key of ['anyOf', 'oneOf', 'allOf'] as const) {
    const baseUnion = asArray(baseline[key]);
    const curUnion = asArray(current[key]);
    if (!baseUnion || !curUnion) continue;
    const baseFingerprints = baseUnion.map((m) => JSON.stringify(m));
    const curFingerprints = curUnion.map((m) => JSON.stringify(m));
    const baseSet = new Set(baseFingerprints);
    const curSet = new Set(curFingerprints);
    for (const fp of baseFingerprints) {
      if (!curSet.has(fp)) breaking.push(`${key} member removed (${path})`);
    }
    for (const fp of curFingerprints) {
      if (!baseSet.has(fp)) additive.push(`${key} member added (${path})`);
    }
  }
}

function diffNumericRange(baseline: JsonObject, current: JsonObject, acc: DiffAcc): void {
  const { breaking, additive } = acc;
  const baseMin = asNumber(baseline['minimum']);
  const curMin = asNumber(current['minimum']);
  if (baseMin === null && curMin !== null) breaking.push(`minimum added (${curMin})`);
  if (baseMin !== null && curMin === null) additive.push('minimum removed');
  if (baseMin !== null && curMin !== null) {
    if (curMin > baseMin) breaking.push(`minimum raised (${baseMin} → ${curMin})`);
    if (curMin < baseMin) additive.push(`minimum lowered (${baseMin} → ${curMin})`);
  }

  const baseMax = asNumber(baseline['maximum']);
  const curMax = asNumber(current['maximum']);
  if (baseMax === null && curMax !== null) breaking.push(`maximum added (${curMax})`);
  if (baseMax !== null && curMax === null) additive.push('maximum removed');
  if (baseMax !== null && curMax !== null) {
    if (curMax < baseMax) breaking.push(`maximum lowered (${baseMax} → ${curMax})`);
    if (curMax > baseMax) additive.push(`maximum raised (${baseMax} → ${curMax})`);
  }
}

function diffStringConstraints(baseline: JsonObject, current: JsonObject, acc: DiffAcc): void {
  const { breaking, additive } = acc;
  const basePattern = asString(baseline['pattern']);
  const curPattern = asString(current['pattern']);
  if (basePattern === null && curPattern !== null) breaking.push(`pattern added (${curPattern})`);
  if (basePattern !== null && curPattern === null) additive.push('pattern removed');
  if (basePattern !== null && curPattern !== null && basePattern !== curPattern) {
    breaking.push(`pattern changed (${basePattern} → ${curPattern})`);
  }

  const baseFormat = asString(baseline['format']);
  const curFormat = asString(current['format']);
  if (baseFormat !== null && curFormat !== null && baseFormat !== curFormat) {
    breaking.push(`format changed (${baseFormat} → ${curFormat})`);
  }
  if (baseFormat === null && curFormat !== null) breaking.push(`format added (${curFormat})`);
  if (baseFormat !== null && curFormat === null) additive.push('format removed');

  const baseMinLen = asNumber(baseline['minLength']);
  const curMinLen = asNumber(current['minLength']);
  if (baseMinLen === null && curMinLen !== null) breaking.push(`minLength added (${curMinLen})`);
  if (baseMinLen !== null && curMinLen !== null && curMinLen > baseMinLen) {
    breaking.push(`minLength raised (${baseMinLen} → ${curMinLen})`);
  }
  const baseMaxLen = asNumber(baseline['maxLength']);
  const curMaxLen = asNumber(current['maxLength']);
  if (baseMaxLen === null && curMaxLen !== null) breaking.push(`maxLength added (${curMaxLen})`);
  if (baseMaxLen !== null && curMaxLen !== null && curMaxLen < baseMaxLen) {
    breaking.push(`maxLength lowered (${baseMaxLen} → ${curMaxLen})`);
  }
}

export function diffZodSurface(baseline: ZodSurface, current: ZodSurface): SurfaceDiff {
  const baselineIdx = indexBy(baseline);
  const currentIdx = indexBy(current);

  const added: string[] = [];
  const removed: string[] = [];
  const changed: ChangedEntry[] = [];

  for (const [name, entry] of currentIdx) {
    if (!baselineIdx.has(name)) {
      added.push(name);
      continue;
    }
    const before = baselineIdx.get(name);
    if (!before) continue;
    const baseObj = asObj(before.schema);
    const curObj = asObj(entry.schema);
    if (!baseObj || !curObj) continue;
    const node = diffNode(baseObj, curObj, name);
    if (node.breaking.length > 0) {
      changed.push({
        name,
        breaking: true,
        reason: node.breaking.join('; '),
      });
    } else if (node.additive.length > 0) {
      changed.push({
        name,
        breaking: false,
        reason: node.additive.join('; '),
      });
    }
  }

  for (const [name] of baselineIdx) {
    if (!currentIdx.has(name)) removed.push(name);
  }

  added.sort();
  removed.sort();
  changed.sort((a, b) => {
    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;
    return 0;
  });

  let kind: SurfaceDiff['kind'] = 'none';
  if (removed.length > 0 || changed.some((c) => c.breaking)) {
    kind = 'breaking';
  } else if (added.length > 0 || changed.length > 0) {
    kind = 'additive';
  }

  return { kind, added, removed, changed };
}
