/**
 * Requirement-level clarification vendored into gsd-remix — Phase 7 (impl plan 7.1–7.3).
 *
 *   7.1 native /gsd-brainstorm command + workflow (convergent idea→PRD, no visual-companion,
 *       self-contained per D0, HARD-GATE at prds/YYYY-MM-DD-<topic>/PRD.md).
 *   7.2 self-review Red Team / risk / YAGNI lenses (threshold-triggered checklist, no new artifact).
 *   7.3 new-milestone / new-project consume an approved PRD (--prd or approved frontmatter + confirm),
 *       never auto-adopting an arbitrary PRD.
 */

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CMD = fs.readFileSync(path.join(ROOT, 'commands', 'gsd', 'brainstorm.md'), 'utf-8');
const WF = fs.readFileSync(path.join(ROOT, 'get-shit-done', 'workflows', 'brainstorm.md'), 'utf-8');
const NEW_MILESTONE = fs.readFileSync(path.join(ROOT, 'get-shit-done', 'workflows', 'new-milestone.md'), 'utf-8');
const NEW_PROJECT = fs.readFileSync(path.join(ROOT, 'get-shit-done', 'workflows', 'new-project.md'), 'utf-8');

describe('7.1 native clarification command', () => {
  test('command shell: name gsd:brainstorm, references its workflow', () => {
    assert.match(CMD, /name:\s*gsd:brainstorm/);
    assert.match(CMD, /workflows\/brainstorm\.md/);
  });

  test('convergent only, self-contained, no visual-companion / external skill', () => {
    assert.match(WF, /convergent/i);
    assert.match(WF, /self-contained/i);
    assert.match(WF, /WITHOUT any browser\/visual-companion|without.*visual-companion/i);
    // D0: must not depend on a user-local skill
    assert.ok(!/\.claude\/skills/.test(WF), 'brainstorm.md must not reference ~/.claude/skills');
    assert.ok(!/brainstorming-prd/.test(WF), 'brainstorm.md must not depend on the external brainstorming-prd skill');
  });

  test('writes prds/YYYY-MM-DD-<topic>/PRD.md with status/target_milestone/last_reviewed', () => {
    assert.match(WF, /prds\/\$\{DATE\}-\$\{SLUG\}|prds\/YYYY-MM-DD/);
    assert.match(WF, /status: draft/);
    assert.match(WF, /target_milestone/);
    assert.match(WF, /last_reviewed/);
  });

  test('HARD GATE at PRD — no downstream auto-invocation', () => {
    assert.match(WF, /HARD GATE/i);
    assert.match(WF, /Do NOT auto-invoke/i);
  });
});

describe('7.2 self-review lenses (checklist, no new artifact)', () => {
  test('Red Team / risk / YAGNI, threshold-triggered, no side files', () => {
    assert.match(WF, /Red Team/i);
    assert.match(WF, /YAGNI/i);
    assert.match(WF, /Threshold-triggered/i);
    assert.match(WF, /no new artifact/i);
    assert.match(WF, /references\/stolen-parts\.md/);
  });
});

describe('7.3 PRD consumption (never auto-adopt an arbitrary PRD)', () => {
  test('new-milestone: --prd or approved frontmatter + confirm', () => {
    assert.match(NEW_MILESTONE, /--prd/);
    assert.match(NEW_MILESTONE, /status: approved/);
    assert.match(NEW_MILESTONE, /target_milestone/);
    assert.match(NEW_MILESTONE, /last_reviewed/);
    assert.match(NEW_MILESTONE, /never auto-consume|Never silently adopt/i);
  });

  test('new-project: same PRD consumption gate', () => {
    assert.match(NEW_PROJECT, /--prd/);
    assert.match(NEW_PROJECT, /status: approved/);
    assert.match(NEW_PROJECT, /Never silently adopt/i);
  });
});
