/**
 * Two-axis structured review — Phase 2 guardrail (impl plan 2.1–2.3).
 *
 * Locks the design contract into the reviewer/fixer/workflow prompt docs:
 *   - REVIEW.md carries spec_status + standards_status, top-level status = worst-of.
 *   - Findings carry axis / evidence / impact / confidence / fixability / blocks_auto_fix.
 *   - Confidence never filters (impact-weighted); low-conf high-impact → Needs Human Review.
 *   - Honest naming: "two-axis structured review", NOT blind; blind = --deep-review opt-in.
 *   - Fixer holds back blocks_auto_fix / needs_decision / manual; --auto stops at them.
 * Plus a pure worst-of status-merge lock.
 */

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const AGENTS = path.join(__dirname, '..', 'agents');
const WORKFLOWS = path.join(__dirname, '..', 'get-shit-done', 'workflows');
const REVIEWER = fs.readFileSync(path.join(AGENTS, 'gsd-code-reviewer.md'), 'utf-8');
const FIXER = fs.readFileSync(path.join(AGENTS, 'gsd-code-fixer.md'), 'utf-8');
const REVIEW_WF = fs.readFileSync(path.join(WORKFLOWS, 'code-review.md'), 'utf-8');
const FIX_WF = fs.readFileSync(path.join(WORKFLOWS, 'code-review-fix.md'), 'utf-8');

describe('reviewer — two-axis REVIEW.md schema (2.1/2.2)', () => {
  test('frontmatter carries spec_status + standards_status + worst-of status', () => {
    assert.match(REVIEWER, /spec_status:/, 'missing spec_status');
    assert.match(REVIEWER, /standards_status:/, 'missing standards_status');
    assert.match(REVIEWER, /worst.?of/i, 'missing worst-of rule');
    // worst-of precedence must be documented
    assert.match(REVIEWER, /issues_found\s*>\s*clean\s*>\s*skipped/, 'missing worst-of precedence');
  });

  test('findings carry axis / evidence / impact / confidence / fixability / blocks_auto_fix', () => {
    for (const field of ['axis', 'evidence', 'impact', 'confidence', 'fixability', 'blocks_auto_fix']) {
      assert.match(REVIEWER, new RegExp(`\\b${field}\\b`), `finding field ${field} not documented`);
    }
    assert.match(REVIEWER, /\bauto\b[^\n]*\bmanual\b[^\n]*\bneeds_decision\b|needs_decision/, 'fixability enum');
  });

  test('impact-weighted, never confidence-gated (drops the confidence≥N filter)', () => {
    assert.match(REVIEWER, /impact-weighted/i);
    assert.match(REVIEWER, /confidence.{0,40}(ordering|never)/i, 'confidence must be ordering-only / never a gate');
    assert.match(REVIEWER, /never (dropped|filtered)/i);
    assert.match(REVIEWER, /Needs Human Review/i, 'low-conf high-impact must surface for human review');
  });

  test('honest naming — structured two-axis, explicitly NOT blind', () => {
    assert.match(REVIEWER, /two-axis/i);
    assert.match(REVIEWER, /not a blind review|NOT a blind/i, 'must disclaim blind-review naming');
  });

  test('spec axis has intent inputs (CONTEXT/PLAN)', () => {
    assert.match(REVIEWER, /CONTEXT\.md/);
    assert.match(REVIEWER, /PLAN\.md/);
  });
});

describe('code-review workflow — deep-review opt-in (2.2)', () => {
  test('--deep-review flag parsed and off by default', () => {
    assert.match(REVIEW_WF, /--deep-review/);
    assert.match(REVIEW_WF, /DEEP_REVIEW=false/, 'deep review must default off');
  });

  test('default path named as structured (not blind); blind = two independent reviewers + synthesis', () => {
    assert.match(REVIEW_WF, /two-axis structured review/i);
    assert.match(REVIEW_WF, /two independent/i, 'blind path spawns two independent reviewers');
    assert.match(REVIEW_WF, /synthesize/i);
  });
});

describe('fixer — holds back human-decision findings (2.3)', () => {
  test('extracts fixability + blocks_auto_fix', () => {
    assert.match(FIXER, /fixability/);
    assert.match(FIXER, /blocks_auto_fix/);
  });

  test('never auto-applies blocks_auto_fix / needs_decision / manual', () => {
    assert.match(FIXER, /NEVER auto-applied|never auto-applied/i);
    assert.match(FIXER, /needs_decision/);
    assert.match(FIXER, /manual fix required/i);
  });

  test('reports needs_human status + Needs Human Decision section', () => {
    assert.match(FIXER, /needs_human/);
    assert.match(FIXER, /Needs Human Decision/i);
  });
});

describe('fix workflow — --auto stops at human-decision findings (2.3)', () => {
  test('auto loop breaks when only human-decision findings remain', () => {
    assert.match(FIX_WF, /ITER_FIX_STATUS/, 'loop must inspect fixer status');
    assert.match(FIX_WF, /needs_human/);
    assert.match(FIX_WF, /Stopping auto-loop/);
  });

  test('results surface the needs_human count', () => {
    assert.match(FIX_WF, /NEEDS_HUMAN_COUNT/);
  });
});

// ─── Pure worst-of status merge (locks the 2.1 merge semantics) ──────────────
// Mirrors the rule documented in gsd-code-reviewer.md write_review.
function worstOf(specStatus, standardsStatus) {
  const rank = { issues_found: 2, clean: 1, skipped: 0 };
  return rank[specStatus] >= rank[standardsStatus] ? specStatus : standardsStatus;
}

describe('worst-of status merge semantics', () => {
  test('issues_found dominates', () => {
    assert.equal(worstOf('issues_found', 'clean'), 'issues_found');
    assert.equal(worstOf('clean', 'issues_found'), 'issues_found');
    assert.equal(worstOf('issues_found', 'skipped'), 'issues_found');
  });
  test('clean beats skipped', () => {
    assert.equal(worstOf('clean', 'skipped'), 'clean');
    assert.equal(worstOf('skipped', 'clean'), 'clean');
  });
  test('both skipped stays skipped; both clean stays clean', () => {
    assert.equal(worstOf('skipped', 'skipped'), 'skipped');
    assert.equal(worstOf('clean', 'clean'), 'clean');
  });
});

// Regression guards for review-session findings (shell-snippet bugs the
// string-only tests missed).
describe('code-review-fix — commit/present read FIX_REPORT_PATH, not REVIEW_PATH (finding B)', () => {
  test('both node checks pass FIX_REPORT_PATH into the child env', () => {
    // commit_fix_report + present_results both read process.env.FIX_REPORT_PATH —
    // the invoking env must set that same var.
    const correct = FIX_WF.match(/FIX_REPORT_PATH="\$\{FIX_REPORT_PATH\}"\s+node -e/g) || [];
    assert.ok(correct.length >= 2, `expected >=2 node checks with FIX_REPORT_PATH env, got ${correct.length}`);
    // The original bug: env set REVIEW_PATH on the SAME node call whose next line read
    // FIX_REPORT_PATH. That exact single-call mismatch must not recur.
    assert.ok(
      !/REVIEW_PATH="\$\{REVIEW_PATH\}"\s+node -e "\s*\n\s*const fs[\s\S]{0,120}?process\.env\.FIX_REPORT_PATH/.test(FIX_WF),
      'a node check sets REVIEW_PATH but reads FIX_REPORT_PATH (env mismatch)',
    );
  });
});

describe('code-review — --files boundary check is portable + separator-safe (finding C)', () => {
  test('does not rely on GNU-only `realpath -m`', () => {
    assert.ok(!/realpath\s+-m/.test(REVIEW_WF), 'realpath -m is GNU-only (fails on macOS/BSD)');
  });
  test('uses a path.relative containment check (rejects sibling-prefix + ..)', () => {
    assert.match(REVIEW_WF, /path\.relative/);
    assert.match(REVIEW_WF, /startsWith\('\.\.' \+ p\.sep\)|startsWith\("\.\." \+ p\.sep\)/);
  });
});
