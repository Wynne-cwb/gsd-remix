/**
 * Evidence-preserving escalation quick → heavy (`route.escalate`).
 *
 * Design: `.plans/gsd-final-form-design.md` → "带证据升档 —— gsd-escalate 状态迁移契约".
 *
 * The DETERMINISTIC core of `gsd-escalate` (v1 is strictly quick→heavy — Fable5
 * non-blocking guardrail #2). Given a completed quick task, it:
 *   1. creates a heavy phase (reusing phase.add — ROADMAP entry + phase dir),
 *   2. seeds that phase's CONTEXT.md from the quick task, folding prior commits +
 *      the prior plan in as *evidence* under the chosen `evidence_status`,
 *   3. updates STATE `Current Phase` so `gsd-next` / `resume-work` route the seeded
 *      phase to PLANNING (it has CONTEXT but no PLAN) — never to verify.
 *
 * It writes NO PLAN.md (so routing lands on plan, not execute/verify) and NEVER
 * touches committed code — atomic commits are the moat; reverting is `gsd-undo`.
 *
 * `evidence_status` is chosen by the caller (the LLM/user judgment layer in the
 * workflow), passed in, and recorded here — it is not inferred deterministically.
 */

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync, realpathSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { GSDError, ErrorClassification } from '../errors.js';
import { planningPaths, sanitizeForPrompt } from './helpers.js';
import { phaseAdd } from './phase-lifecycle.js';
import { stateReplaceField } from './state-mutation.js';
import { readModifyWriteStateMdFull } from './state-mutation.js';
import type { QueryHandler } from './utils.js';

const EVIDENCE_STATES = new Set([
  'accepted_prior_work',
  'suspect_prior_work',
  'revert_recommended',
]);

const EVIDENCE_GUIDANCE: Record<string, string> = {
  accepted_prior_work:
    'Prior quick-task work is confirmed sound — the planner builds on top of it.',
  suspect_prior_work:
    'Escalation reason implies the prior implementation may be wrong — the planner MUST re-review it before normalizing; do not assume it is correct.',
  revert_recommended:
    'Prior work is likely misdirected — recommend `gsd-undo` or a revert plan before continuing. Committed code is NOT reverted automatically.',
};

interface EscalateArgs {
  quick: string;
  evidence: string;
  goal: string | null;
}

function parseArgs(args: string[]): EscalateArgs {
  let quick = '';
  let evidence = '';
  let goal: string | null = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--evidence') evidence = args[++i] ?? '';
    else if (a.startsWith('--evidence=')) evidence = a.slice('--evidence='.length);
    else if (a === '--goal') goal = args[++i] ?? null;
    else if (a.startsWith('--goal=')) goal = a.slice('--goal='.length);
    else if (!quick) quick = a;
  }
  return { quick, evidence, goal };
}

/** Resolve a quick-task directory from an id, slug fragment, or path. */
async function resolveQuickDir(quick: string, projectDir: string): Promise<string> {
  const quickRoot = resolve(join(planningPaths(projectDir).planning, 'quick'));

  // Physical containment: resolve symlinks and require the REAL path under the REAL
  // quick root. Lexical containment alone is not enough — a symlink inside
  // .planning/quick/ pointing outside the repo would otherwise inject external
  // content into the new heavy phase (review findings: `../escape` and symlink escape).
  const ensureInside = (p: string): string => {
    const rootReal = existsSync(quickRoot) ? realpathSync(quickRoot) : quickRoot;
    const real = realpathSync(p);
    if (real === rootReal || real.startsWith(rootReal + sep)) return real;
    throw new GSDError(
      `Quick task path escapes .planning/quick/ — refusing to escalate external content`,
      ErrorClassification.Validation,
    );
  };

  // A directly-supplied path is honored ONLY if it lexically resolves inside the
  // quick root; the physical check below then rejects any symlink escape.
  const abs = resolve(projectDir, quick);
  if ((abs === quickRoot || abs.startsWith(quickRoot + sep)) && existsSync(abs)) return ensureInside(abs);
  if (!existsSync(quickRoot)) {
    throw new GSDError(`No .planning/quick/ directory — nothing to escalate`, ErrorClassification.Validation);
  }
  const entries = await readdir(quickRoot, { withFileTypes: true });
  const match = entries.find(
    (e) => (e.isDirectory() || e.isSymbolicLink()) && (e.name === quick || e.name.startsWith(`${quick}-`) || e.name.includes(quick)),
  );
  if (!match) {
    throw new GSDError(`Quick task not found for "${quick}" under .planning/quick/`, ErrorClassification.Validation);
  }
  return ensureInside(join(quickRoot, match.name));
}

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return null;
  }
}

/** Best-effort: commit hashes/subjects referencing the quick id. Never throws. */
function collectCommits(quickId: string, projectDir: string): string[] {
  try {
    const out = execFileSync('git', ['log', '--oneline', '--format=%h %s', `--grep=${quickId}`], {
      cwd: projectDir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    return out.split('\n').map((l) => l.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export const routeEscalate: QueryHandler = async (args, projectDir) => {
  const { quick, evidence, goal } = parseArgs(args);
  if (!quick) {
    throw new GSDError('route.escalate requires a quick task id/dir', ErrorClassification.Validation);
  }
  if (!EVIDENCE_STATES.has(evidence)) {
    throw new GSDError(
      `--evidence must be one of: ${[...EVIDENCE_STATES].join(', ')}`,
      ErrorClassification.Validation,
    );
  }

  const quickDir = await resolveQuickDir(quick, projectDir);
  const quickName = quickDir.split(/[\\/]/).pop() as string;
  // quick dir is `<quick_id>-<slug>`; artifacts are `<quick_id>-CONTEXT.md` etc.
  const quickId = quickName.replace(/-[^-]*$/, '').match(/^\d{6}-[a-z0-9]+/i)?.[0] ?? quickName.split('-').slice(0, 2).join('-');

  const files = await readdir(quickDir).catch(() => [] as string[]);
  const contextFile = files.find((f) => /-CONTEXT\.md$/.test(f));
  const planFile = files.find((f) => /-PLAN\.md$/.test(f));
  const quickContext = contextFile ? await readIfExists(join(quickDir, contextFile)) : null;
  const quickPlan = planFile ? await readIfExists(join(quickDir, planFile)) : null;
  const commits = collectCommits(quickId, projectDir);

  const description = goal || quickName.replace(/^\d{6}-[a-z0-9]+-/i, '').replace(/-/g, ' ') || quickName;

  // 1. Create the heavy phase (ROADMAP entry + directory) — reuses phase.add.
  const added = (await phaseAdd([description], projectDir)).data as {
    phase_number: number | string;
    padded: string;
    name: string;
    slug: string;
    directory: string;
  };

  // 2. Seed CONTEXT.md — carries intent + prior work as evidence. NO PLAN.md is
  //    written, so gsd-next routes this phase to plan-phase (not verify).
  const contextPath = join(projectDir, added.directory, `${added.padded}-CONTEXT.md`);
  // Quick-task CONTEXT/PLAN are untrusted content spliced into a heavy-phase
  // CONTEXT.md via node fs (no Write tool → PreToolUse prompt-guard never fires;
  // the read scanner excludes .planning/ paths). Neutralize instruction-mimicking
  // markers before they can ride into the planner's context (Fable5 A5).
  const priorDecisions = quickContext
    ? sanitizeForPrompt(quickContext.replace(/^---[\s\S]*?---\n/, '').trim())
    : '(no CONTEXT.md was captured for the quick task)';
  const priorPlan = quickPlan
    ? '```\n' + sanitizeForPrompt(quickPlan.replace(/^---[\s\S]*?---\n/, '').trim()).slice(0, 4000) + '\n```'
    : '(no PLAN.md was captured for the quick task)';
  const commitList = commits.length
    ? commits.map((c) => `- ${c}`).join('\n')
    : '- (no commits found referencing this quick task)';

  const seeded = `---
phase: ${added.padded}-${added.slug}
gathered: escalated-from-quick
status: Ready for planning
escalated_from: ${quickName}
evidence_status: ${evidence}
---

# Phase ${added.phase_number}: ${description} - Context

**Source:** escalated from quick task \`${quickName}\` (evidence_status: **${evidence}**)

<domain>
## Phase Boundary

${description}
</domain>

<prior_work>
## Prior Work (evidence — ${evidence})

${EVIDENCE_GUIDANCE[evidence]}

**Prior commits (already on the branch — NEVER auto-reverted):**
${commitList}

**Prior quick plan (reference, re-plan under heavy):**
${priorPlan}
</prior_work>

<decisions>
## Implementation Decisions (from the quick task)

${priorDecisions}
</decisions>

<deferred>
## Deferred / Re-review

${evidence === 'accepted_prior_work'
    ? 'Prior work accepted — plan continues on top.'
    : evidence === 'suspect_prior_work'
      ? 'Prior implementation is SUSPECT — the plan must re-review it, not normalize it as-is.'
      : 'Revert recommended — run `gsd-undo` or generate a revert plan before building further.'}
</deferred>
`;
  await writeFile(contextPath, seeded, 'utf-8');

  // 3. Update STATE Current Phase → the seeded phase, needs planning.
  //    (Current Phase + no PLAN.md ⇒ gsd-next routes to /gsd-plan-phase.)
  const stateUpdated: string[] = [];
  try {
    await readModifyWriteStateMdFull(projectDir, (content: string) => {
      let c = content;
      const cp = stateReplaceField(c, 'Current Phase', String(added.phase_number));
      if (cp) { c = cp; stateUpdated.push('Current Phase'); }
      const cpn = stateReplaceField(c, 'Current Phase Name', added.name);
      if (cpn) { c = cpn; stateUpdated.push('Current Phase Name'); }
      const st = stateReplaceField(c, 'Status', `Escalated from quick — needs planning (Phase ${added.phase_number})`);
      if (st) { c = st; stateUpdated.push('Status'); }
      return c;
    });
  } catch {
    // STATE update is best-effort; the phase + CONTEXT are the durable migration.
  }

  return {
    data: {
      phase_number: added.phase_number,
      padded: added.padded,
      phase_dir: added.directory,
      context_path: `${added.directory}/${added.padded}-CONTEXT.md`,
      evidence_status: evidence,
      revert_recommended: evidence === 'revert_recommended',
      escalated_from: quickName,
      prior_commits: commits,
      state_updated: stateUpdated,
      routed_to: 'plan',
      reverted_code: false,
    },
  };
};
