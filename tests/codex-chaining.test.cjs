/**
 * Codex command-chaining rewrite (Fable5 E1/E2/E3 + verification ①).
 *
 * On Codex, GSD steps chain via Claude-only Skill()/SlashCommand() calls. A bare
 * $gsd-* mention does not reliably trigger a skill mid-run (no human turn inside
 * a gate or an autonomous chain), so the transform rewrites each call to
 * "read and execute the workflow .md in this context", carrying arguments
 * verbatim. These tests lock the contract that a mid-run/autonomous chain used
 * to silently break on Codex.
 */
'use strict';

process.env.GSD_TEST_MODE = '1'; // gate install.js test-only exports (skips main install)

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const {
  convertClaudeToCodexMarkdown,
  getCodexSkillAdapterHeader,
} = require('../bin/install.js');

const GLOBAL_BASE = '$HOME/.codex/';
const LOCAL_BASE = '/proj/.codex/';

describe('Codex chaining rewrite (E1/E3/①)', () => {
  test('SlashCommand chain: workflow .md + args verbatim, no mention/shell', () => {
    const out = convertClaudeToCodexMarkdown(
      'Exit skill and invoke SlashCommand("/gsd-plan-phase [X+1] --auto ${GSD_WS}")',
      GLOBAL_BASE,
    );
    assert.match(out, /read and execute the workflow file `\$HOME\/\.codex\/get-shit-done\/workflows\/plan-phase\.md`/);
    assert.match(out, /\[X\+1\] --auto \$\{GSD_WS\}/, 'args carried verbatim (dropping --auto would hang an unattended chain)');
    assert.doesNotMatch(out, /SlashCommand\(/);
    assert.doesNotMatch(out, /by mentioning it \(do NOT run it in the shell\)/);
  });

  test('Skill chain (plain quotes) rewritten with args', () => {
    const out = convertClaudeToCodexMarkdown(
      'Skill(skill="gsd-execute-phase", args="${PHASE_NUM} --no-transition")',
      GLOBAL_BASE,
    );
    assert.match(out, /workflows\/execute-phase\.md/);
    assert.match(out, /\$\{PHASE_NUM\} --no-transition/);
    assert.doesNotMatch(out, /Skill\(\s*skill/);
  });

  test('E3: escaped-quote Skill inside an Agent() prompt is rewritten', () => {
    // Real shape from autonomous.md: Skill(skill=\"gsd:plan-phase\", args=\"${PHASE_NUM}\")
    const src = 'prompt="Run plan-phase: Skill(skill=\\"gsd:plan-phase\\", args=\\"${PHASE_NUM}\\")"';
    const out = convertClaudeToCodexMarkdown(src, GLOBAL_BASE);
    assert.match(out, /workflows\/plan-phase\.md/);
    assert.match(out, /\$\{PHASE_NUM\}/);
    assert.doesNotMatch(out, /Skill\(skill=\\?"gsd/, 'escaped-quote Skill must not survive the transform');
  });

  test('argument-less chain still resolves the workflow path', () => {
    const out = convertClaudeToCodexMarkdown('Skill(skill="gsd-cleanup")', GLOBAL_BASE);
    assert.match(out, /workflows\/cleanup\.md/);
  });

  test('①: path inlines per install form (local absolute base)', () => {
    const out = convertClaudeToCodexMarkdown('SlashCommand("/gsd-execute-phase 2")', LOCAL_BASE);
    assert.match(out, /`\/proj\/\.codex\/get-shit-done\/workflows\/execute-phase\.md`/);
  });
});

describe('Codex adapter §D (E2)', () => {
  const adapter = getCodexSkillAdapterHeader('gsd-plan-phase');

  test('does not tell agents to run gsd-remix-sdk query as the workflow', () => {
    assert.doesNotMatch(adapter, /run the SDK route directly/);
    assert.match(adapter, /Running a query is not running the workflow/);
  });

  test('directs read-and-execute of the workflow .md for chaining', () => {
    assert.match(adapter, /READ the target workflow's `?\.md/i);
  });
});
