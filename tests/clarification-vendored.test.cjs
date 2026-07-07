/**
 * Requirement-level clarification vendored into gsd-remix — Phase 7 (impl plan 7.1–7.3),
 * plus the capability-gated visual companion re-added in v1.3.
 *
 *   7.1 native /gsd-brainstorm command + workflow (convergent idea→PRD, self-contained
 *       per D0, HARD-GATE at prds/YYYY-MM-DD-<topic>/PRD.md).
 *   7.2 self-review Red Team / risk / YAGNI lenses (threshold-triggered checklist, no new artifact).
 *   7.3 new-milestone / new-project consume an approved PRD (--prd or approved frontmatter + confirm),
 *       never auto-adopting an arbitrary PRD.
 *   VIS visual companion: native (no external skill / no MCP dependency), convergent,
 *       capability-gated + degradable, never blocks the gate; spec in references/brainstorm-visuals.md.
 *   DO  /gsd-do HEAVY branch routes an unripe spec to /gsd-brainstorm first.
 */

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CMD = fs.readFileSync(path.join(ROOT, 'commands', 'gsd', 'brainstorm.md'), 'utf-8');
const WF = fs.readFileSync(path.join(ROOT, 'get-shit-done', 'workflows', 'brainstorm.md'), 'utf-8');
const VISUALS = fs.readFileSync(path.join(ROOT, 'get-shit-done', 'references', 'brainstorm-visuals.md'), 'utf-8');
const DO = fs.readFileSync(path.join(ROOT, 'get-shit-done', 'workflows', 'do.md'), 'utf-8');
const NEW_MILESTONE = fs.readFileSync(path.join(ROOT, 'get-shit-done', 'workflows', 'new-milestone.md'), 'utf-8');
const NEW_PROJECT = fs.readFileSync(path.join(ROOT, 'get-shit-done', 'workflows', 'new-project.md'), 'utf-8');

describe('7.1 native clarification command', () => {
  test('command shell: name gsd:brainstorm, references its workflow', () => {
    assert.match(CMD, /name:\s*gsd:brainstorm/);
    assert.match(CMD, /workflows\/brainstorm\.md/);
  });

  test('convergent only, self-contained, no external skill dependency', () => {
    assert.match(WF, /convergent/i);
    assert.match(WF, /self-contained/i);
    assert.match(WF, /divergent ideation is\s*\n?\s*out of scope|divergent ideation is out of scope/i);
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

describe('VIS visual companion (native, convergent, capability-gated, degradable)', () => {
  test('workflow: visualize step gated on brainstorm_visual, delegates to the reference', () => {
    assert.match(WF, /<step name="visualize">/);
    assert.match(WF, /workflow\.brainstorm_visual/);
    assert.match(WF, /references\/brainstorm-visuals\.md/);
    // degrades and never blocks the hard gate
    assert.match(WF, /never (?:hard-fail|let a missing).*block the gate|degrad/i);
  });

  test('command shell injects the visuals reference as execution_context', () => {
    assert.match(CMD, /brainstorm-visuals\.md/);
  });

  test('reference is self-contained: no external skill, no MCP hard dependency', () => {
    assert.match(VISUALS, /self-contained/i);
    assert.match(VISUALS, /convergent/i);
    assert.match(VISUALS, /capability[- ]gated/i);
    assert.ok(!/\.claude\/skills/.test(VISUALS), 'brainstorm-visuals.md must not reference ~/.claude/skills');
    assert.match(VISUALS, /no MCP|no external skill/i);
  });

  test('two tiers: Mermaid degraded (portable) + gated MOCKUP.html enhanced', () => {
    assert.match(VISUALS, /Mermaid/);
    assert.match(VISUALS, /MOCKUP\.html/);
    assert.match(VISUALS, /off\b/);
    assert.match(VISUALS, /auto\b/);
    assert.match(VISUALS, /\bon\b/);
  });
});

describe('DO HEAVY spec-first gate routes to brainstorm', () => {
  test('do.md HEAVY branch routes an unripe spec to /gsd-brainstorm first', () => {
    assert.match(DO, /HEAVY spec-first gate/i);
    assert.match(DO, /\/gsd-brainstorm/);
    // ripe/spec'd HEAVY skips brainstorm
    assert.match(DO, /skip brainstorm|already-clear HEAVY/i);
  });
});
