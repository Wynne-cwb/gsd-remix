/**
 * Quick / autonomous flag compatibility fixture — Phase 0 guardrail (impl plan 0.2).
 *
 * Locks the CURRENT, pre-final-form flag semantics of gsd-quick and
 * gsd-autonomous so that the later phases which touch them do so deliberately:
 *
 *   - Phase 3 (MEDIUM) — DONE: `--review` split out of `--full`, `--validate-lite`
 *     is the always-on baseline, `--full` === `--discuss --research --validate --review`.
 *     The quick assertions below now pin that post-Phase-3 baseline.
 *   - Phase 5 (team mode) reinterprets autonomous's `--auto` / `--interactive`.
 *     The autonomous assertions below are the tripwire for that.
 *
 * This is an anti-drift guardrail (Fable5 R2 M1), not a behavioral test — quick.md
 * / autonomous.md are prompt docs, so we assert on their documented contract.
 */

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const WORKFLOWS = path.join(__dirname, '..', 'get-shit-done', 'workflows');
const QUICK = fs.readFileSync(path.join(WORKFLOWS, 'quick.md'), 'utf-8');
const AUTONOMOUS = fs.readFileSync(path.join(WORKFLOWS, 'autonomous.md'), 'utf-8');

describe('quick flag compat — post-Phase-3 baseline', () => {
  test('documented granular flags include full, validate, review, discuss, research', () => {
    for (const flag of ['--full', '--validate', '--review', '--discuss', '--research']) {
      assert.match(QUICK, new RegExp(`\\${flag}\\b`), `quick.md should document ${flag}`);
    }
  });

  test('--validate-lite is the always-on baseline (not a user flag)', () => {
    assert.match(QUICK, /validate-lite/i, '--validate-lite baseline must be documented');
    assert.match(QUICK, /acceptance.{0,20}verify|acceptance` \+ `verify/i, 'baseline requires acceptance + verify fields');
  });

  test('--full expands to discuss + research + validate + review (backward-compatible aggregate)', () => {
    assert.match(
      QUICK,
      /`--full` flag → store `\$FULL_MODE=true`, `\$DISCUSS_MODE=true`, `\$RESEARCH_MODE=true`, `\$VALIDATE_MODE=true`, `\$REVIEW_MODE=true`/,
      '--full must set all five booleans (incl. review)'
    );
  });

  test('granular flags are composable into --full (normalize rule includes review)', () => {
    assert.match(
      QUICK,
      /if `\$DISCUSS_MODE` and `\$RESEARCH_MODE` and `\$VALIDATE_MODE` and `\$REVIEW_MODE` are all true, set `\$FULL_MODE=true`/,
      'normalize rule: discuss+research+validate+review === full'
    );
    assert.match(
      QUICK,
      /`--discuss --research --validate --review` is treated identically to `--full`/,
      'composability statement must include review'
    );
  });

  test('each granular flag maps to its own mode boolean', () => {
    assert.match(QUICK, /`--validate` flag → store `\$VALIDATE_MODE=true`/);
    assert.match(QUICK, /`--review` flag → store `\$REVIEW_MODE=true`/);
    assert.match(QUICK, /`--discuss` flag → store `\$DISCUSS_MODE=true`/);
    assert.match(QUICK, /`--research` flag → store `\$RESEARCH_MODE=true`/);
  });

  test('plan gate config key documented (quick_plan_gate)', () => {
    assert.match(QUICK, /quick_plan_gate/);
  });
});

describe('autonomous flag compat — current baseline (pre-Phase-5 team mode)', () => {
  test('range/selection flags documented: --from N, --to N, --only N', () => {
    assert.match(AUTONOMOUS, /`--from N`/, 'autonomous.md should document --from N');
    assert.match(AUTONOMOUS, /`--to N`/, 'autonomous.md should document --to N');
    assert.match(AUTONOMOUS, /`--only N`/, 'autonomous.md should document --only N');
  });

  test('--only pins FROM_PHASE to the same value (single-phase semantics)', () => {
    assert.match(
      AUTONOMOUS,
      /When `--only` is set, also set `FROM_PHASE` to the same value/,
      '--only single-phase filter semantics must remain'
    );
  });

  test('--interactive runs discuss inline; plan/execute dispatched as background agents', () => {
    assert.match(
      AUTONOMOUS,
      /When `--interactive` is set, discuss runs inline with questions .*plan and execute are dispatched as background agents/s,
      '--interactive current semantics (Phase 5 team mode reinterprets this)'
    );
  });

  test('--interactive compatible with --only / --from / --to', () => {
    assert.match(
      AUTONOMOUS,
      /`--interactive` compatible with `--only`, `--from`, and `--to` flags/,
      'flag compatibility invariant must remain'
    );
  });
});
