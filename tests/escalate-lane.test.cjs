/**
 * Evidence-preserving escalation — Phase 6 guardrail (impl plan 6.1/6.2).
 *
 *   6.1 gsd-escalate quick→heavy: evidence_status three states, seed via route.escalate,
 *       STATE current phase, route to plan not verify, never revert committed code.
 *   6.2 fast→ downgrade: evidence packet + handoff only (no auto-migration).
 *   v1 is strictly quick→heavy (Fable5 non-blocking guardrail #2).
 *
 * The deterministic migration chain is fixture-tested in
 * sdk/src/query/route-escalate.test.ts; this locks the command/workflow contract.
 */

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CMD = fs.readFileSync(path.join(ROOT, 'commands', 'gsd', 'escalate.md'), 'utf-8');
const WF = fs.readFileSync(path.join(ROOT, 'get-shit-done', 'workflows', 'escalate.md'), 'utf-8');

describe('escalate command shell', () => {
  test('frontmatter name gsd:escalate and references its workflow', () => {
    assert.match(CMD, /name:\s*gsd:escalate/);
    assert.match(CMD, /workflows\/escalate\.md/);
  });
});

describe('escalate workflow — quick→heavy contract (6.1)', () => {
  test('v1 restricted to quick→heavy (no medium↔heavy / arbitrary relocation)', () => {
    assert.match(WF, /quick\s*→\s*heavy/i);
    assert.match(WF, /does NOT do medium.{0,4}heavy|not.*medium.*heavy/i);
  });

  test('evidence_status three states drive treatment', () => {
    assert.match(WF, /accepted_prior_work/);
    assert.match(WF, /suspect_prior_work/);
    assert.match(WF, /revert_recommended/);
  });

  test('delegates the deterministic migration to route.escalate', () => {
    assert.match(WF, /route\.escalate/);
  });

  test('seeded phase routes to plan (CONTEXT, no PLAN), STATE current phase updated', () => {
    assert.match(WF, /no PLAN/i);
    assert.match(WF, /route.*plan|plan-phase/i);
    assert.match(WF, /Current Phase/);
  });

  test('never reverts committed code — only surfaces gsd-undo', () => {
    assert.match(WF, /never reverts committed code/i);
    assert.match(WF, /gsd-undo/);
  });
});

describe('escalate workflow — fast downgrade (6.2)', () => {
  test('--from-fast produces an evidence packet + handoff, no auto-migration', () => {
    assert.match(WF, /--from-fast/);
    assert.match(WF, /evidence packet/i);
    assert.match(WF, /do not create a phase|no auto-migration|Do not create a phase/i);
  });
});
