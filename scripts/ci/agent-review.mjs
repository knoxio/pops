#!/usr/bin/env node
/**
 * LLM reviewer (advisory layer of the agent-review gate).
 *
 * The two deterministic guards — `check-contract-isolation.mjs` and
 * `check-lib-no-pillar-import.mjs` — are the load-bearing, blocking checks.
 * This reviewer is the taste/intent layer: it asks an Opus model to judge the
 * PR diff against the federation invariants rubric and posts a verdict as a PR
 * comment. It is **advisory** — it never fails the build (any error, missing
 * credential, or API hiccup degrades to exit 0), so a flaky model call can
 * never block a green PR. The deterministic guards are what gate.
 *
 * Rubric (00-architecture.md §6, README hard constraints):
 *   - no `as any` / `as unknown as T` / `eslint-disable` / `ts-ignore`
 *   - no cross-contract reach-behind; a lib never depends on a pillar
 *   - no orphan TODO (file an issue + reference, or omit)
 *   - no Claude/AI-assistant reference in commits or PR body
 *   - the extract-to-own-repo litmus is addressed for any new/moved unit
 *
 * Requires `ANTHROPIC_API_KEY` to run; without it the step is a no-op (the
 * repo does not provision the key today — see plan §A.3). `GITHUB_TOKEN` +
 * `--pr <n>` enable posting the verdict comment; without them the verdict is
 * logged only.
 *
 * Usage:
 *   node scripts/ci/agent-review.mjs --pr 1234
 *
 * Always exits 0.
 */

import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

const MODEL = 'claude-opus-4-8';
const MAX_DIFF_BYTES = 180_000;

const RUBRIC = [
  'No `as any`, no `as unknown as T`, no `eslint-disable` / `ts-ignore` / suppressions.',
  "No cross-contract reach-behind (importing another unit's src/dist/internal); a lib never depends on a pillar.",
  'No orphan TODO (must reference a filed issue).',
  'No reference to Claude / AI assistants in commit messages or the PR body.',
  'For any new or relocated unit, the extract-to-own-repo litmus is satisfied (it could build/deploy/self-register in its own repo, changing only where shared deps come from).',
].join('\n- ');

/** @param {string[]} argv */
function parseArgs(argv) {
  const prIdx = argv.indexOf('--pr');
  const pr = prIdx >= 0 ? argv[prIdx + 1] : process.env.PR_NUMBER;
  const baseRef = process.env.GITHUB_BASE_REF ?? 'main';
  return { pr, base: `origin/${baseRef}` };
}

/**
 * @param {string} base
 * @returns {string}
 */
function collectDiff(base) {
  /** @param {string[]} a */
  const git = (a) => execFileSync('git', a, { cwd: repoRoot, encoding: 'utf8' });
  let mergeBase = base;
  try {
    const found = git(['merge-base', base, 'HEAD']).trim();
    if (found) mergeBase = found;
  } catch {
    /* fall back to the raw ref */
  }
  let diff = '';
  try {
    diff = git(['diff', mergeBase, 'HEAD']);
  } catch {
    return '';
  }
  return diff.length > MAX_DIFF_BYTES
    ? `${diff.slice(0, MAX_DIFF_BYTES)}\n\n…[diff truncated]…`
    : diff;
}

/**
 * @param {string} diff
 * @param {string} apiKey
 * @returns {Promise<string>}
 */
async function review(diff, apiKey) {
  const prompt =
    `You are reviewing a pull request in the POPS federation monorepo against ` +
    `these non-negotiable invariants:\n\n- ${RUBRIC}\n\n` +
    `Review ONLY the unified diff below. Reply with a short verdict: first line ` +
    `exactly "VERDICT: PASS" or "VERDICT: CONCERNS", then up to 5 bullet points ` +
    `citing file:line for any concern. Do not nitpick style the formatter owns.\n\n` +
    `\`\`\`diff\n${diff}\n\`\`\``;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  }
  /** @type {{ content?: Array<{ type: string; text?: string }> }} */
  const body = await res.json();
  return (body.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('\n')
    .trim();
}

/**
 * @param {string} pr
 * @param {string} verdict
 */
function postComment(pr, verdict) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo || !pr) {
    console.log('No GITHUB_TOKEN/repo/PR — verdict logged only, not posted.');
    return;
  }
  const body = `### 🤖 Agent review (advisory)\n\n${verdict}`;
  try {
    execFileSync('gh', ['api', `repos/${repo}/issues/${pr}/comments`, '-f', `body=${body}`], {
      cwd: repoRoot,
      stdio: 'inherit',
      env: process.env,
    });
  } catch (err) {
    console.log(
      `Could not post PR comment (non-fatal): ${err instanceof Error ? err.message : err}`
    );
  }
}

async function main() {
  const { pr, base } = parseArgs(process.argv.slice(2));
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log(
      'agent-review: ANTHROPIC_API_KEY not set — skipping LLM review (advisory layer). ' +
        'The deterministic isolation guards remain the blocking checks.'
    );
    return;
  }
  const diff = collectDiff(base);
  if (!diff.trim()) {
    console.log('agent-review: empty diff — nothing to review.');
    return;
  }
  try {
    const verdict = await review(diff, apiKey);
    console.log(`agent-review verdict:\n${verdict}`);
    if (pr) postComment(pr, verdict);
  } catch (err) {
    console.log(
      `agent-review: LLM review failed (non-fatal, advisory): ${err instanceof Error ? err.message : err}`
    );
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.log(`agent-review: unexpected error (non-fatal): ${err}`);
    process.exit(0);
  }
);
