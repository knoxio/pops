/**
 * The guard-job tier invariant (ADR-045, tier amendment).
 *
 * Guard jobs come in two tiers. A **Tier A** job runs its guards straight after
 * `actions/checkout` with no `pnpm install`, so the gate answers in seconds and
 * cannot be broken by a dependency problem it exists to be independent of. A
 * **Tier B** job installs the workspace first, because its guards read YAML or
 * TOML through a real parser.
 *
 * The split only holds while somebody can say which job is which. Nobody can,
 * by reading: the tier of a job is a property of the transitive import closure
 * of every script it runs, and one `import { load } from 'js-yaml'` three files
 * deep moves it. Left to review, the failure is a `MODULE_NOT_FOUND` inside a
 * REQUIRED check — not a red build on the PR that caused it, a red build on
 * every PR afterwards.
 *
 * So the tier is not declared anywhere. It is DERIVED, and by the only method
 * that cannot be fooled: every Tier A guard is loaded for real, in a copy of
 * `scripts/` with no `node_modules` anywhere above it. A static import scan
 * would have to model multi-line imports, dynamic imports, and the import
 * statements these guards embed inside self-test fixture strings; loading the
 * module asks Node the same question CI asks it.
 */

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { isMapping, parseYaml, scalarText, walkMappings } from '../config-parse.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const workflowsDir = join(repoRoot, '.github', 'workflows');

/** A `run:` step that puts `node_modules` on disk for the steps after it. */
const INSTALLS = /\bpnpm\s+(?:install|i)\b/u;

/** `node path/to/guard.mjs` inside a `run:` block, however many per block. */
const NODE_INVOCATION = /\bnode\s+(scripts\/[\w./-]+\.mjs)/gu;

/** Node's two ways of saying "that bare specifier is not on disk". */
const UNRESOLVED = /ERR_MODULE_NOT_FOUND|Cannot find package|Cannot find module/u;

interface GuardJob {
  workflow: string;
  job: string;
  installs: boolean;
  scripts: string[];
}

function workflowFiles(): string[] {
  return readdirSync(workflowsDir)
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .toSorted((a, b) => a.localeCompare(b));
}

/**
 * Every job in every workflow that runs at least one `node scripts/….mjs`,
 * with whether an install precedes its steps.
 *
 * `installs` is per JOB rather than per step: GitHub runs a job's steps in
 * order in one workspace, and every install in this repo sits above the guards
 * it serves. A job that installed AFTER its guards would be a different bug,
 * and not one a `node_modules`-less run could hide.
 */
function guardJobs(): GuardJob[] {
  const jobs: GuardJob[] = [];
  for (const file of workflowFiles()) {
    const doc = parseYaml(readFileSync(join(workflowsDir, file), 'utf8'), file);
    if (!isMapping(doc) || !isMapping(doc.jobs)) continue;
    for (const [name, job] of Object.entries(doc.jobs)) {
      if (!isMapping(job) || !Array.isArray(job.steps)) continue;
      let installs = false;
      const scripts = new Set<string>();
      for (const entry of walkMappings(job.steps)) {
        if (entry.key !== 'run') continue;
        const run = scalarText(entry.value);
        if (run === undefined) continue;
        if (INSTALLS.test(run)) installs = true;
        for (const [, script] of run.matchAll(NODE_INVOCATION)) {
          if (script !== undefined) scripts.add(script);
        }
      }
      if (scripts.size > 0) {
        jobs.push({ workflow: file, job: name, installs, scripts: [...scripts] });
      }
    }
  }
  return jobs;
}

const jobs = guardJobs();
const tierA = jobs.filter((j) => !j.installs);
const tierB = jobs.filter((j) => j.installs);

/** A copy of `scripts/` with no `node_modules` above it — the Tier A runtime. */
let sandbox: string;

beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'guard-tier-'));
  cpSync(join(repoRoot, 'scripts'), join(sandbox, 'scripts'), { recursive: true });
});

afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

/**
 * Load a guard's module graph with no `node_modules` reachable, and report what
 * Node could not resolve.
 *
 * `process.argv[1]` is undefined under `node -e`, so every guard's
 * `import.meta.url === process.argv[1]` entry check is false and `main()` does
 * not run — this resolves the imports and stops. The one guard that calls its
 * entry point unconditionally executes against an empty tree and reports
 * violations, which is read-only and not what this looks at.
 */
function loadWithoutNodeModules(script: string): string {
  const target = pathToFileURL(join(sandbox, script)).href;
  try {
    execFileSync(
      process.execPath,
      ['--input-type=module', '-e', `await import(${JSON.stringify(target)});`],
      {
        cwd: sandbox,
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 60_000,
        env: { ...process.env, NODE_PATH: '' },
      }
    );
    return '';
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr ?? '';
    return UNRESOLVED.test(stderr)
      ? (stderr.split('\n').find((l) => UNRESOLVED.test(l)) ?? stderr)
      : '';
  }
}

describe('guard-job discovery', () => {
  // A derived invariant is only as good as its discovery: parse the workflows
  // wrong and every assertion below passes over an empty set.
  it('finds guard invocations across several workflows', () => {
    expect(new Set(jobs.map((j) => j.workflow)).size).toBeGreaterThanOrEqual(3);
    expect(jobs.length).toBeGreaterThanOrEqual(8);
  });

  it('finds jobs in both tiers', () => {
    expect(tierA.length).toBeGreaterThan(0);
    expect(tierB.length).toBeGreaterThan(0);
  });

  it('resolves every invoked script to a file on disk', () => {
    for (const { workflow, job, scripts } of jobs) {
      for (const script of scripts) {
        expect(existsSync(join(repoRoot, script)), `${workflow} ${job} runs ${script}`).toBe(true);
      }
    }
  });

  it('reads the guards it is meant to be about', () => {
    const all = new Set(jobs.flatMap((j) => j.scripts));
    expect(all).toContain('scripts/ci/check-node-pin.mjs');
    expect(all).toContain('scripts/ci/smoke-image.mjs');
    expect(all).toContain('scripts/check-pillar-ui-reachability.mjs');
  });
});

describe('the sandbox really has no node_modules', () => {
  // Without this the Tier A suite below passes for the one reason it must never
  // pass: a sandbox that can still resolve `js-yaml` says every guard is fine.
  it('cannot load a guard that imports a parser', () => {
    expect(loadWithoutNodeModules('scripts/ci/smoke-image.mjs')).toMatch(UNRESOLVED);
  });

  it('cannot load config-parse.mjs itself', () => {
    expect(loadWithoutNodeModules('scripts/ci/config-parse.mjs')).toMatch(UNRESOLVED);
  });
});

describe('Tier A — an install-free job may not reach a third-party import', () => {
  it.each(tierA.map((j) => [`${j.workflow} → ${j.job}`, j] as const))('%s', (_label, job) => {
    for (const script of job.scripts) {
      expect(
        loadWithoutNodeModules(script),
        `${job.workflow} job "${job.job}" runs ${script} with no \`pnpm install\`, but the ` +
          'script does not load without node_modules. That is a MODULE_NOT_FOUND inside a ' +
          'required check, and not only on the PR that introduced it. Either drop the ' +
          'dependency or move the job to Tier B by adding pnpm/action-setup + ' +
          '`pnpm install --frozen-lockfile` (see ' +
          'docs/architecture/adr-045-guards-must-prove-they-report.md).'
      ).toBe('');
    }
  });
});

describe('Tier B — a job whose guards need a parser keeps its install', () => {
  // An explicit roster, so DELETING an install fails here rather than quietly
  // demoting the job. The derived half above cannot see that: a job with no
  // install and no third-party import is a legitimate Tier A job.
  const REQUIRED_INSTALLS: ReadonlyArray<readonly [string, string]> = [
    ['agent-review.yml', 'agent-review'],
    ['rust-quality.yml', 'quality'],
    ['docker-build.yml', 'docker-build'],
    // The two merge-queue scoping jobs. `merge-group-scope.mjs` parses the
    // workflow it is scoping, so losing the install here would not be a slower
    // gate — it would be a MODULE_NOT_FOUND in the job that decides whether a
    // macOS compile happens at all.
    ['ios-quality.yml', 'scope'],
    ['docker-build.yml', 'scope'],
  ];

  it.each(REQUIRED_INSTALLS)('%s → %s installs the workspace', (workflow, job) => {
    const found = jobs.find((j) => j.workflow === workflow && j.job === job);
    expect(found, `${workflow} has no job "${job}" running a guard`).toBeDefined();
    expect(
      found?.installs,
      `${workflow} job "${job}" runs a guard that parses YAML or TOML and must keep its ` +
        '`pnpm install --frozen-lockfile` step.'
    ).toBe(true);
  });

  it.each(REQUIRED_INSTALLS)('%s → %s really does reach a parser', (workflow, job) => {
    const found = jobs.find((j) => j.workflow === workflow && j.job === job);
    const unresolved = (found?.scripts ?? []).map((s) => loadWithoutNodeModules(s)).filter(Boolean);
    expect(
      unresolved,
      `${workflow} job "${job}" is on the Tier B roster but every one of its guards loads ` +
        'without node_modules. Either it belongs in Tier A now, or the roster is stale.'
    ).not.toEqual([]);
  });
});

describe('the shared Tier B modules are libraries, not checks', () => {
  // Running one as a workflow step would report nothing and exit 0, which is
  // the shape ADR-045 exists to end.
  it.each(['scripts/ci/config-parse.mjs', 'scripts/ci/compose-schema.mjs'])(
    '%s is never invoked by a workflow as a guard',
    (module) => {
      expect(new Set(jobs.flatMap((j) => j.scripts))).not.toContain(module);
    }
  );
});

/**
 * POPS-2197: the ADR-045 tables drifted from the workflows twice — once by
 * omission (two guards never got a Tier A row) and once by undercount (the
 * prose said "four" parser guards in `agent-review` while the table only
 * ever listed three). Both mistakes were found by a human rereading the
 * workflows against the tables. This derives the same comparison so the next
 * one fails `scripts-tests` instead of waiting for a rereading.
 *
 * A script "owns" a job here if it runs there WITHOUT `--self-test` on that
 * line — a guard that only self-tests inside `agent-review` as a preflight
 * (`merge-group-scope.mjs`) does not newly "belong" to that job the way its
 * real job does, and documenting every self-test site as a fresh ownership
 * claim would make the tables list jobs a guard is merely proven inside, not
 * jobs it gates. `agent-review.mjs` is excluded outright: ADR-045 itself
 * draws the line between the guards, which decide whether a change may
 * merge, and the LLM step, which only comments — it is never a table row.
 */
describe('ADR-045 tables agree with the derived tiers', () => {
  const SELF_TEST_FLAG = '--self-test';
  const NOT_A_GUARD = new Set([
    // The advisory LLM reviewer. ADR-045's decision section is explicit that
    // the guards gate and the reviewer only comments, so it is never subject
    // to the guard tier split this file derives.
    'scripts/ci/agent-review.mjs',
    // Packs a release artifact; it fails loud on a missing mount but does
    // not gate a PR the way ADR-045's guards do, and carries no `--self-test`
    // to prove it — release.yml is a `push`-tag workflow, not a guard job.
    'scripts/pack-moltbot-bundle.mjs',
  ]);

  function ownedGuardJobs(): GuardJob[] {
    const owned: GuardJob[] = [];
    for (const file of workflowFiles()) {
      const doc = parseYaml(readFileSync(join(workflowsDir, file), 'utf8'), file);
      if (!isMapping(doc) || !isMapping(doc.jobs)) continue;
      for (const [name, job] of Object.entries(doc.jobs)) {
        if (!isMapping(job) || !Array.isArray(job.steps)) continue;
        let installs = false;
        const scripts = new Set<string>();
        for (const entry of walkMappings(job.steps)) {
          if (entry.key !== 'run') continue;
          const run = scalarText(entry.value);
          if (run === undefined) continue;
          if (INSTALLS.test(run)) installs = true;
          for (const line of run.split('\n')) {
            if (line.includes(SELF_TEST_FLAG)) continue;
            for (const [, script] of line.matchAll(NODE_INVOCATION)) {
              if (script !== undefined && !NOT_A_GUARD.has(script)) scripts.add(script);
            }
          }
        }
        if (scripts.size > 0)
          owned.push({ workflow: file, job: name, installs, scripts: [...scripts] });
      }
    }
    return owned;
  }

  interface AdrRow {
    guard: string;
    workflow: string;
    job: string;
  }

  const adrPath = join(
    repoRoot,
    'docs',
    'architecture',
    'adr-045-guards-must-prove-they-report.md'
  );
  const adrText = readFileSync(adrPath, 'utf8');

  /**
   * Pulls `(guard, workflow, job)` triples out of one of the ADR's two
   * pipe-tables. A Job cell may name more than one workflow/job pair
   * (`merge-group-scope.mjs` runs in two), so every backtick-quoted token in
   * that cell is read in `(workflow, job)` pairs rather than assuming one.
   */
  function parseAdrTable(sectionHeading: string): AdrRow[] {
    const sectionStart = adrText.indexOf(sectionHeading);
    if (sectionStart < 0) return [];
    const section = adrText.slice(sectionStart);
    const tableStart = section.indexOf('\n| Guard');
    if (tableStart < 0) return [];
    const rows: AdrRow[] = [];
    for (const line of section.slice(tableStart + 1).split('\n')) {
      if (!line.startsWith('|')) break;
      const cells = line
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim());
      const guardCell = cells[0];
      const jobCell = cells[1];
      if (cells.length < 2 || guardCell === undefined || jobCell === undefined) continue;
      if (guardCell === 'Guard' || guardCell.startsWith('---')) continue;
      const guardMatch = /`([^`]+)`/u.exec(guardCell);
      if (!guardMatch) continue;
      const tokens = [...jobCell.matchAll(/`([^`]+)`/gu)].map((m) => m[1]!);
      for (let i = 0; i + 1 < tokens.length; i += 2) {
        rows.push({ guard: guardMatch[1]!, workflow: tokens[i]!, job: tokens[i + 1]! });
      }
    }
    return rows;
  }

  /** The "Tier A guards that ride in a Tier B job" prose list, not a table. */
  function parseRideAlongGuards(): string[] {
    const heading = '### Tier A guards that ride in a Tier B job';
    const sectionStart = adrText.indexOf(heading);
    if (sectionStart < 0) return [];
    const nextHeading = adrText.indexOf('\n### ', sectionStart + heading.length);
    const section = adrText.slice(sectionStart, nextHeading < 0 ? undefined : nextHeading);
    const listLine = section.split('\n').find((l) => l.startsWith('`check-'));
    if (!listLine) return [];
    return [...listLine.matchAll(/`(check-[\w-]+\.mjs)`/gu)].map((m) => `scripts/ci/${m[1]}`);
  }

  const adrTierARows = parseAdrTable('### Tier A — install-free');
  const adrTierBRows = parseAdrTable('### Tier B — installs the workspace');
  const rideAlongGuards = parseRideAlongGuards();

  // A guard documented only as "rides along" belongs to agent-review.yml's
  // agent-review job — that is the only job the prose describes, and the
  // only one with Tier-B-installing siblings a Tier A guard could ride with.
  const rideAlongRows: AdrRow[] = rideAlongGuards.map((guard) => ({
    guard,
    workflow: 'agent-review.yml',
    job: 'agent-review',
  }));

  const owned = ownedGuardJobs();
  const ownedTierA = owned.filter((j) => !j.installs);
  const ownedTierB = owned.filter((j) => j.installs);

  // Table discovery is only as good as its own regexes: fail loud if either
  // parse comes back empty, rather than letting every assertion below pass
  // vacuously over zero rows.
  it('finds rows in both ADR tables and the ride-along list', () => {
    expect(adrTierARows.length).toBeGreaterThan(5);
    expect(adrTierBRows.length).toBeGreaterThan(3);
    expect(rideAlongGuards.length).toBeGreaterThan(0);
  });

  it.each(
    ownedTierA.flatMap((j) =>
      j.scripts.map((script) => [`${script} @ ${j.workflow} → ${j.job}`, j, script] as const)
    )
  )('%s is documented in the ADR-045 Tier A table', (_label, job, script) => {
    const documented = adrTierARows.some(
      (r) => r.guard === script && r.workflow === job.workflow && r.job === job.job
    );
    expect(
      documented,
      `${job.workflow} job "${job.job}" runs ${script} install-free, but ADR-045's Tier A table has ` +
        `no row for it. Add one to docs/architecture/adr-045-guards-must-prove-they-report.md.`
    ).toBe(true);
  });

  it.each(
    ownedTierB.flatMap((j) =>
      j.scripts.map((script) => [`${script} @ ${j.workflow} → ${j.job}`, j, script] as const)
    )
  )(
    '%s is documented in the ADR-045 Tier B table or the ride-along list',
    (_label, job, script) => {
      const documented = [...adrTierBRows, ...rideAlongRows].some(
        (r) => r.guard === script && r.workflow === job.workflow && r.job === job.job
      );
      expect(
        documented,
        `${job.workflow} job "${job.job}" runs ${script} in an installing job, but ADR-045's Tier B ` +
          `table (and the "rides in a Tier B job" list) have no row for it. Add one to ` +
          `docs/architecture/adr-045-guards-must-prove-they-report.md.`
      ).toBe(true);
    }
  );

  // The reverse direction: a table row naming a guard/job pair that no
  // longer runs that way is exactly as stale as a missing row, and nothing
  // above would catch it — both loops above only ever add evidence FOR a
  // documented pair, never against an undocumented one.
  it.each(adrTierARows.map((r) => [`${r.guard} @ ${r.workflow} → ${r.job}`, r] as const))(
    'Tier A row %s names a guard job that still runs install-free',
    (_label, row) => {
      const match = ownedTierA.find(
        (j) => j.workflow === row.workflow && j.job === row.job && j.scripts.includes(row.guard)
      );
      expect(
        match,
        `ADR-045 Tier A table row "${row.guard}" @ ${row.workflow} → ${row.job} does not match any ` +
          'install-free guard job found in the workflows. Fix or remove the row.'
      ).toBeDefined();
    }
  );

  it.each(adrTierBRows.map((r) => [`${r.guard} @ ${r.workflow} → ${r.job}`, r] as const))(
    'Tier B row %s names a guard job that still installs',
    (_label, row) => {
      if (row.job === 'Scripts tests') {
        // check-ci-gate-wiring.mjs runs through its own Vitest suite, not a
        // `node scripts/….mjs` step — the ADR says so, and it is the one
        // documented pair `ownedGuardJobs` structurally cannot see.
        expect(row.guard).toBe('scripts/ci/check-ci-gate-wiring.mjs');
        expect(existsSync(join(repoRoot, row.guard))).toBe(true);
        return;
      }
      const match = ownedTierB.find(
        (j) => j.workflow === row.workflow && j.job === row.job && j.scripts.includes(row.guard)
      );
      expect(
        match,
        `ADR-045 Tier B table row "${row.guard}" @ ${row.workflow} → ${row.job} does not match any ` +
          'installing guard job found in the workflows. Fix or remove the row.'
      ).toBeDefined();
    }
  );

  it.each(rideAlongRows.map((r) => [`${r.guard} @ ${r.workflow} → ${r.job}`, r] as const))(
    'ride-along guard %s still runs, install-free in itself, inside its Tier B job',
    (_label, row) => {
      const match = owned.find(
        (j) => j.workflow === row.workflow && j.job === row.job && j.scripts.includes(row.guard)
      );
      expect(
        match,
        `ADR-045's "rides in a Tier B job" list names "${row.guard}" @ ${row.workflow} → ${row.job}, ` +
          'which no longer matches a guard job found in the workflows. Fix or remove it from the list.'
      ).toBeDefined();
    }
  );
});
