/**
 * MEDIUM lane (gsd-quick) — Phase 3 guardrail (impl plan 3.1–3.5).
 *
 *   3.1 validate-lite is the always-on baseline (acceptance/verify + runnable evidence, no verifier spawn)
 *   3.2 --review is an independent switch; --full still aggregates it
 *   3.3 workflow.quick_plan_gate (auto|ask|off) plan→execute gate; --auto never hangs
 *   3.4 verification gradient (RED-GREEN / snapshot / docs / manual with admission gate)
 *   3.5 EARS / RED-GREEN referenced as hints via references/stolen-parts.md
 */

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');

const QUICK = fs.readFileSync(
  path.join(__dirname, '..', 'get-shit-done', 'workflows', 'quick.md'), 'utf-8'
);
const { VALID_CONFIG_KEYS } = require('../get-shit-done/bin/lib/config-schema.cjs');

describe('3.1 validate-lite baseline', () => {
  test('always-on: planner emits acceptance + verify per task', () => {
    assert.match(QUICK, /Validate-lite baseline \(always\)/i);
    assert.match(QUICK, /`acceptance`, `verify`/);
  });

  test('executor produces runnable evidence without spawning a verifier', () => {
    assert.match(QUICK, /runnable verification evidence/i);
    assert.match(QUICK, /does NOT spawn a verifier/i);
  });
});

describe('3.2 --review split from --full', () => {
  test('code review step gated on REVIEW_MODE, not FULL_MODE', () => {
    assert.match(QUICK, /Skip this step entirely if `\$REVIEW_MODE` is false/);
  });
});

describe('3.3 plan gate (quick_plan_gate)', () => {
  test('Step 5.7 reads workflow.quick_plan_gate with auto default', () => {
    assert.match(QUICK, /workflow\.quick_plan_gate/);
    assert.match(QUICK, /echo "auto"/, 'default must be auto (no stop)');
    assert.match(QUICK, /never hang an unattended run/i);
  });

  test('ask mode has a text-mode numbered-list fallback', () => {
    assert.match(QUICK, /Text mode:.*numbered list/is);
  });

  test('config key registered in the validator', () => {
    assert.ok(VALID_CONFIG_KEYS.has('workflow.quick_plan_gate'),
      'workflow.quick_plan_gate must be a valid config key');
  });

  test('config-get workflow.quick_plan_gate resolves', () => {
    const tmp = createTempProject();
    try {
      fs.writeFileSync(
        path.join(tmp, '.planning', 'config.json'),
        JSON.stringify({ workflow: { quick_plan_gate: 'ask' } }, null, 2), 'utf-8'
      );
      const r = runGsdTools(['config-get', 'workflow.quick_plan_gate'], tmp);
      assert.ok(r.success, 'config-get should succeed');
      assert.ok(r.output === 'ask' || r.output === '"ask"', `got ${r.output}`);
    } finally {
      cleanup(tmp);
    }
  });
});

describe('3.4 verification gradient', () => {
  test('branches by change type: RED-GREEN / snapshot / docs / manual', () => {
    assert.match(QUICK, /Test seam exists.*RED-GREEN/is);
    assert.match(QUICK, /CLI \/ config change.*snapshot|snapshot or schema/is);
    assert.match(QUICK, /Docs \/ text change/is);
  });

  test('manual verification has an admission gate and does NOT count as green', () => {
    assert.match(QUICK, /admission gate/i);
    assert.match(QUICK, /does \*\*NOT\*\* count as green|NOT count as green/i);
    assert.match(QUICK, /UAT\/deferred|UAT/);
  });
});

describe('3.5 EARS / RED-GREEN as hints (not gates)', () => {
  test('references the local stolen-parts anchor, not external originals', () => {
    assert.match(QUICK, /references\/stolen-parts\.md/);
    assert.match(QUICK, /EARS/);
  });
});
