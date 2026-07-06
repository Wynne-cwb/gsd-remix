/**
 * LIGHT lane + shared high-risk preflight — Phase 4 guardrail (impl plan 4.1/4.2).
 *
 * Locks into fast.md / quick.md:
 *   - Both call the SAME route.risk-scan (one lexicon, no drift).
 *   - fast (LIGHT) refuses `hard` risk unless --force-light (with recorded reason).
 *   - fast uses reproduce-then-resolve with inline evidence.
 *   - quick (MEDIUM) surfaces `hard` risk and recommends HEAVY.
 */

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const WORKFLOWS = path.join(__dirname, '..', 'get-shit-done', 'workflows');
const FAST = fs.readFileSync(path.join(WORKFLOWS, 'fast.md'), 'utf-8');
const QUICK = fs.readFileSync(path.join(WORKFLOWS, 'quick.md'), 'utf-8');

describe('fast lane — high-risk preflight (4.2)', () => {
  test('calls the shared route.risk-scan helper', () => {
    assert.match(FAST, /route\.risk-scan/, 'fast.md must use the shared risk scanner');
  });

  test('refuses LIGHT on a hard hit and points to a heavier lane', () => {
    assert.match(FAST, /MAX_STRENGTH.*hard|hard.*refuse/is);
    assert.match(FAST, /\/gsd-quick|\/gsd-do/, 'must redirect to a heavier lane');
  });

  test('--force-light is an explicit override that records a reason', () => {
    assert.match(FAST, /--force-light/);
    assert.match(FAST, /FORCE_LIGHT/);
    assert.match(FAST, /forced-light:/i, 'override must record a reason in the commit');
  });
});

describe('fast lane — reproduce-then-resolve (4.1)', () => {
  test('reproduces the symptom before fixing and confirms it gone after', () => {
    assert.match(FAST, /reproduce-then-resolve/i);
    assert.match(FAST, /Reproduce first/i);
    assert.match(FAST, /symptom is gone|Confirm resolved/i);
  });

  test('shows the before/after evidence inline (no artifact files)', () => {
    assert.match(FAST, /evidence.*(reply|response)/is);
    assert.match(FAST, /No PLAN\.md/);
  });
});

describe('quick lane — shared preflight recommends HEAVY on hard (4.2)', () => {
  test('calls the same route.risk-scan helper', () => {
    assert.match(QUICK, /route\.risk-scan/, 'quick.md must reuse the shared risk scanner');
  });

  test('on hard, recommends a heavier lane and does not silently proceed under --auto', () => {
    assert.match(QUICK, /high-risk surface/i);
    assert.match(QUICK, /\/gsd-do|\/gsd-add-phase/);
    assert.match(QUICK, /do NOT silently proceed/i);
  });
});
