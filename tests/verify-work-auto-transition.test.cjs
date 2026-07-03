'use strict';

/**
 * verify-work auto-transition tests (#2018)
 *
 * Validates that verify-work.md calls the transition workflow to mark the
 * phase complete in ROADMAP.md and STATE.md when UAT passes with 0 issues.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const VERIFY_WORK = path.join(__dirname, '..', 'get-shit-done', 'workflows', 'verify-work.md');

describe('verify-work.md — auto-transition after UAT passes with 0 issues', () => {
  test('workflow reads transition.md when issues == 0', () => {
    const content = fs.readFileSync(VERIFY_WORK, 'utf-8');
    assert.ok(
      content.includes('transition.md'),
      'verify-work.md must reference transition.md for phase completion when issues == 0'
    );
  });

  test('transition call appears after complete_session section', () => {
    const content = fs.readFileSync(VERIFY_WORK, 'utf-8');
    const completeSessionIdx = content.indexOf('complete_session');
    const transitionIdx = content.indexOf('transition.md');
    assert.ok(
      completeSessionIdx !== -1,
      'verify-work.md must contain a complete_session section'
    );
    assert.ok(
      transitionIdx !== -1,
      'verify-work.md must reference transition.md'
    );
    assert.ok(
      transitionIdx > completeSessionIdx,
      'transition.md reference must appear after the complete_session section'
    );
  });

});
