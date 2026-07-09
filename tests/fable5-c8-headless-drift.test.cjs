/**
 * Fable5 C8 — headless near-duplicate drift + shared-contract guard.
 *
 * `sdk/prompts/{agents,workflows}` carries 13 headless prompt variants used at
 * runtime by phase-prompt.ts / init-runner.ts. Eleven are deliberately trimmed
 * (8–20% of canonical) and are intentionally divergent — NOT guarded here.
 *
 * TWO of them are near-verbatim copies of their canonical agents:
 *   - gsd-roadmapper          (canonical ~659 lines, headless ~641)
 *   - gsd-research-synthesizer (canonical ~247 lines, headless ~237)
 * Because they are hand-maintained (not generated from canonical), an edit to
 * one side can silently drift from the other. This guard does two things:
 *   1. Drift bound — the line multiset symmetric difference must stay small, so
 *      a unilateral rewrite of either side trips the test.
 *   2. Shared contract — the artifact filenames each agent produces/consumes
 *      must appear on BOTH sides, so a rename of an output contract can't land
 *      on only one copy.
 *
 * Pure-JS diff (no `diff(1)` subprocess) to stay portable — this repo ships a
 * Windows-robustness guard, so tests must not depend on POSIX tools.
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Near-duplicate pairs only. Current symmetric-difference: roadmapper 34,
// synthesizer 20. Thresholds sit ~2x above to absorb ordinary small edits
// while failing loudly on a one-sided rewrite.
const PAIRS = [
  {
    name: 'gsd-roadmapper',
    canonical: 'agents/gsd-roadmapper.md',
    headless: 'sdk/prompts/agents/gsd-roadmapper.md',
    maxSymDiff: 70,
    contract: ['ROADMAP.md', 'REQUIREMENTS.md', 'SUMMARY.md'],
  },
  {
    name: 'gsd-research-synthesizer',
    canonical: 'agents/gsd-research-synthesizer.md',
    headless: 'sdk/prompts/agents/gsd-research-synthesizer.md',
    maxSymDiff: 45,
    contract: ['SUMMARY.md', 'research/'],
  },
];

function readTrimmedLines(rel) {
  const abs = path.join(ROOT, rel);
  return fs
    .readFileSync(abs, 'utf-8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

// Order-independent line-multiset symmetric difference — a portable proxy for
// `diff | grep -cE '^[<>]'` that ignores pure line moves.
function symmetricDiff(linesA, linesB) {
  const count = (arr) => {
    const m = new Map();
    for (const l of arr) m.set(l, (m.get(l) || 0) + 1);
    return m;
  };
  const ma = count(linesA);
  const mb = count(linesB);
  let d = 0;
  for (const k of new Set([...ma.keys(), ...mb.keys()])) {
    d += Math.abs((ma.get(k) || 0) - (mb.get(k) || 0));
  }
  return d;
}

describe('Fable5 C8: headless near-duplicate drift guard', () => {
  for (const pair of PAIRS) {
    test(`${pair.name}: canonical and headless copies both exist`, () => {
      assert.ok(fs.existsSync(path.join(ROOT, pair.canonical)), `${pair.canonical} must exist`);
      assert.ok(fs.existsSync(path.join(ROOT, pair.headless)), `${pair.headless} must exist`);
    });

    test(`${pair.name}: headless stays a near-duplicate of canonical`, () => {
      const d = symmetricDiff(readTrimmedLines(pair.canonical), readTrimmedLines(pair.headless));
      assert.ok(
        d <= pair.maxSymDiff,
        `${pair.name}: canonical/headless line symmetric-difference is ${d}, over the ${pair.maxSymDiff} bound. ` +
          `These are hand-maintained near-duplicates — sync both sides, or if the divergence is intentional, ` +
          `raise maxSymDiff here with a note.`,
      );
    });

    test(`${pair.name}: shared artifact contract present on both sides`, () => {
      const canon = fs.readFileSync(path.join(ROOT, pair.canonical), 'utf-8');
      const head = fs.readFileSync(path.join(ROOT, pair.headless), 'utf-8');
      for (const marker of pair.contract) {
        assert.ok(
          canon.includes(marker),
          `${pair.canonical} must reference the artifact contract "${marker}"`,
        );
        assert.ok(
          head.includes(marker),
          `${pair.headless} must reference the artifact contract "${marker}" (drifted from canonical)`,
        );
      }
    });
  }
});
