/**
 * HEAVY lane — multi-lens architecture + team mode — Phase 5 (impl plan 5.1/5.2).
 *
 *   5.1 plan-phase: conditional multi-lens architecture selection (new arch/dep/data model only)
 *   5.2 autonomous: team mode merged in — capability gate + no-op probe, three mechanisms
 *       (Decision Harvest / fresh per-step teammate / deferred UAT), flag matrix, default auto (probe-gated).
 *   D0: vendored team-mode references are self-contained (no dependency on a user-local skill).
 */

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WORKFLOWS = path.join(ROOT, 'get-shit-done', 'workflows');
const REFS = path.join(ROOT, 'get-shit-done', 'references');
const AUTONOMOUS = fs.readFileSync(path.join(WORKFLOWS, 'autonomous.md'), 'utf-8');
const PLAN_PHASE = fs.readFileSync(path.join(WORKFLOWS, 'plan-phase.md'), 'utf-8');
const TEAM_MODE = fs.readFileSync(path.join(REFS, 'team-mode.md'), 'utf-8');
const TEAMMATE_PROMPTS = fs.readFileSync(path.join(REFS, 'teammate-prompts.md'), 'utf-8');
const AUTOPILOT = fs.readFileSync(path.join(REFS, 'milestone-autopilot.md'), 'utf-8');
const NEW_PROJECT = fs.readFileSync(path.join(WORKFLOWS, 'new-project.md'), 'utf-8');
const NEW_MILESTONE = fs.readFileSync(path.join(WORKFLOWS, 'new-milestone.md'), 'utf-8');
const { VALID_CONFIG_KEYS } = require('../get-shit-done/bin/lib/config-schema.cjs');

describe('5.1 multi-lens architecture selection (conditional)', () => {
  test('triggers only on new architecture / dependency / data model', () => {
    assert.match(PLAN_PHASE, /Architecture Selection \(multi-lens, conditional\)/i);
    assert.match(PLAN_PHASE, /new architectural component/i);
    assert.match(PLAN_PHASE, /new dependency/i);
    assert.match(PLAN_PHASE, /new data model/i);
    assert.match(PLAN_PHASE, /skip silently/i, 'routine phases must skip');
  });

  test('a locally high-risk but routine phase does NOT trigger it', () => {
    assert.match(PLAN_PHASE, /locally high-risk but architecturally routine/i);
  });

  test('minimal/clean/pragmatic with a recommendation, --auto adopts, injects choice', () => {
    assert.match(PLAN_PHASE, /Minimal/);
    assert.match(PLAN_PHASE, /Clean/);
    assert.match(PLAN_PHASE, /Pragmatic/);
    assert.match(PLAN_PHASE, /adopt the recommended approach without stopping/i);
    assert.match(PLAN_PHASE, /<architecture_choice>/);
  });

  test('references the local stolen-parts anchor (§6), not external originals', () => {
    assert.match(PLAN_PHASE, /references\/stolen-parts\.md/);
  });
});

describe('5.2 team mode in autonomous.md', () => {
  test('reads workflow.team_mode config', () => {
    assert.match(AUTONOMOUS, /workflow\.team_mode/);
    assert.match(AUTONOMOUS, /TEAM_MODE=/);
  });

  test('gate runs coarse runtime + fine no-op Agent probe BEFORE harvest/artifact', () => {
    assert.match(AUTONOMOUS, /<step name="team_mode">/);
    assert.match(AUTONOMOUS, /before.*any Decision Harvest|BEFORE.*artifact/is);
    assert.match(AUTONOMOUS, /no-op Agent probe/i);
    assert.match(AUTONOMOUS, /runtime_identity|runtime\.health/);
  });

  test('probe-fail behavior: auto silent fallback / on error-stop / off no probe', () => {
    assert.match(AUTONOMOUS, /silently fall back/i);
    assert.match(AUTONOMOUS, /error and stop/i);
    assert.match(AUTONOMOUS, /never write a half state/i);
  });

  test('--auto = after-harvest unattended (not disable); team beats --interactive', () => {
    assert.match(AUTONOMOUS, /after-harvest unattended|after harvest/i);
    assert.match(AUTONOMOUS, /does NOT disable team|beats `--interactive`|team wins/i);
  });

  test('delegates the milestone loop to references/team-mode.md', () => {
    assert.match(AUTONOMOUS, /references\/team-mode\.md/);
  });

  test('config key registered', () => {
    assert.ok(VALID_CONFIG_KEYS.has('workflow.team_mode'));
  });
});

describe('references/team-mode.md — vendored spec', () => {
  test('covers the three mechanisms', () => {
    assert.match(TEAM_MODE, /Decision Harvest/);
    assert.match(TEAM_MODE, /Fresh teammate per bounded step/i);
    assert.match(TEAM_MODE, /Deferred UAT/i);
  });

  test('probe + default auto (probe-gated, safe fallback) + flag matrix + conservative labeling', () => {
    assert.match(TEAM_MODE, /no-op Agent probe/i);
    assert.match(TEAM_MODE, /default is `auto`|Shipped default is `auto`/i);
    assert.match(TEAM_MODE, /Flag matrix/i);
    assert.match(TEAM_MODE, /stable_now/);
    assert.match(TEAM_MODE, /depends_on_phase_output/);
    assert.match(TEAM_MODE, /Default to this whenever in doubt/i);
  });
});

describe('D0 self-containment — vendored refs do not depend on a user-local skill', () => {
  test('team-mode.md and teammate-prompts.md never reference ~/.claude/skills or gsd-team-lead', () => {
    for (const [name, body] of [['team-mode.md', TEAM_MODE], ['teammate-prompts.md', TEAMMATE_PROMPTS]]) {
      assert.ok(!/\.claude\/skills/.test(body), `${name} must not reference ~/.claude/skills`);
      assert.ok(!/gsd-team-lead/.test(body), `${name} must not reference the user-local gsd-team-lead skill`);
    }
  });

  test('team-mode.md states it is self-contained / gsd-remix ships it', () => {
    assert.match(TEAM_MODE, /self-contained/i);
  });
});

describe('milestone autopilot — roadmap → autonomous Team Lead handoff', () => {
  test('reference: config ask/auto/off, default ask, capability-gated on team + Claude runtime', () => {
    assert.match(AUTOPILOT, /workflow\.auto_milestone/);
    assert.match(AUTOPILOT, /default `ask`/i);
    assert.match(AUTOPILOT, /\bask\b/);
    assert.match(AUTOPILOT, /\bauto\b/);
    assert.match(AUTOPILOT, /\boff\b/);
    // gated on the same team-mode probe + Claude Code runtime + team_mode != off
    assert.match(AUTOPILOT, /references\/team-mode\.md/);
    assert.match(AUTOPILOT, /no-op Agent probe/i);
    assert.match(AUTOPILOT, /team_mode` (?:is|must not be)? *`?off/i);
  });

  test('reference: confirm-once, hands off to /gsd-autonomous --auto, clears the yolo chain, headless skips confirm', () => {
    assert.match(AUTOPILOT, /AskUserQuestion/);
    assert.match(AUTOPILOT, /SlashCommand\("\/gsd-autonomous --auto"\)/);
    assert.match(AUTOPILOT, /_auto_chain_active false/);
    assert.match(AUTOPILOT, /[Hh]eadless.*skip|skip.*confirm/);
  });

  test('reference: falls back to normal next-step when gate fails or auto_milestone off', () => {
    assert.match(AUTOPILOT, /fall (?:through|back).*next-step|next-step messaging/i);
    assert.match(AUTOPILOT, /Never on a non-Claude runtime/i);
  });

  test('new-project and new-milestone follow the autopilot before their next-step block', () => {
    for (const [name, body] of [['new-project.md', NEW_PROJECT], ['new-milestone.md', NEW_MILESTONE]]) {
      assert.match(body, /references\/milestone-autopilot\.md/, `${name} must follow the autopilot`);
      assert.match(body, /If it hands off, stop here/i, `${name} must not double-run next-step after handoff`);
    }
  });

  test('D0: autopilot reference is self-contained (no user-local skill dependency)', () => {
    assert.match(AUTOPILOT, /self-contained/i);
    assert.ok(!/\.claude\/skills/.test(AUTOPILOT), 'milestone-autopilot.md must not reference ~/.claude/skills');
    assert.ok(!/gsd-team-lead/.test(AUTOPILOT), 'milestone-autopilot.md must not reference gsd-team-lead');
  });

  test('config key workflow.auto_milestone is registered', () => {
    assert.ok(VALID_CONFIG_KEYS.has('workflow.auto_milestone'));
  });
});
