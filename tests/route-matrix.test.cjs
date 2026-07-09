/**
 * Route acceptance matrix — Phase 0 guardrail (impl plan 0.1).
 *
 * The size-axis router (design D5/D6) IS live: `route.size-classify` is
 * registered (sdk/src/query/index.ts) and drives gsd-do's size_route step.
 * This file locks the GOLDEN DATASET (tests/fixtures/route-matrix.json) — its
 * schema, coverage, and the routing invariants that must hold no matter how the
 * classifier is built (most importantly that `unknown → MEDIUM` never swallows
 * LIGHT, and that every `hard` risk hit forces HEAVY).
 *
 * The behavioral gate — running each sample through the real scanner and
 * asserting risk evidence — lives in the SDK vitest suite:
 *   sdk/src/query/route-size-classify.test.ts
 *     → "route matrix — deterministic risk evidence (golden gate)"
 * (see the footer of this file). This CJS file is dataset invariants only.
 */

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const MATRIX = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'route-matrix.json'), 'utf-8')
);
const SAMPLES = MATRIX.samples;

const LANES = new Set(MATRIX.lanes);
const STRENGTHS = new Set(MATRIX.risk_strengths);

// Samples that exercise the size/risk classification (everything except the
// runtime-gate rows, which reuse one description to probe runtime × mode).
const ROUTING_SAMPLES = SAMPLES.filter(s => s.category !== 'runtime-gate');

describe('route matrix — dataset schema', () => {
  test('every sample has required fields with valid enums', () => {
    for (const s of SAMPLES) {
      assert.ok(s.id, `sample missing id: ${JSON.stringify(s)}`);
      assert.ok(typeof s.description === 'string' && s.description.length > 0, `${s.id}: description`);
      assert.ok(Array.isArray(s.candidate_paths), `${s.id}: candidate_paths must be array`);
      assert.ok(LANES.has(s.expected_lane), `${s.id}: bad expected_lane ${s.expected_lane}`);
      assert.ok(s.risk && STRENGTHS.has(s.risk.expected_strength), `${s.id}: bad risk.expected_strength`);
      assert.ok(typeof s.rationale === 'string' && s.rationale.length > 0, `${s.id}: rationale`);
    }
  });

  test('sample ids are unique', () => {
    const ids = SAMPLES.map(s => s.id);
    assert.strictEqual(new Set(ids).size, ids.length, 'duplicate sample id');
  });
});

describe('route matrix — coverage (Fable5 acceptance-matrix requirements)', () => {
  test('at least 20 routing samples', () => {
    assert.ok(ROUTING_SAMPLES.length >= 20, `only ${ROUTING_SAMPLES.length} routing samples`);
  });

  test('at least 7 high-risk-alias samples', () => {
    const aliases = SAMPLES.filter(s => s.category === 'high-risk-alias');
    assert.ok(aliases.length >= 7, `only ${aliases.length} high-risk aliases`);
  });

  test('risk strengths hard / soft / noise each represented', () => {
    for (const strength of ['hard', 'soft', 'noise']) {
      const n = SAMPLES.filter(s => s.risk.expected_strength === strength).length;
      assert.ok(n >= 1, `no sample with risk strength "${strength}"`);
    }
  });

  test('at least 3 migration samples', () => {
    const migrations = SAMPLES.filter(s => s.category === 'migration');
    assert.ok(migrations.length >= 3, `only ${migrations.length} migration samples`);
  });

  test('all 4 runtime × mode gate combinations present', () => {
    const gates = SAMPLES.filter(s => s.category === 'runtime-gate');
    const combos = new Set(gates.map(s => `${s.runtime}:${s.mode}`));
    for (const combo of ['claude:interactive', 'claude:auto', 'non-claude:interactive', 'non-claude:auto']) {
      assert.ok(combos.has(combo), `missing runtime-gate combo ${combo}`);
    }
  });
});

describe('route matrix — routing invariants (must hold for any classifier)', () => {
  // Escalation 铁律: touching a hard high-risk surface forces HEAVY.
  test('every hard risk hit expects HEAVY', () => {
    for (const s of SAMPLES) {
      if (s.risk.expected_strength === 'hard') {
        assert.strictEqual(s.expected_lane, 'HEAVY', `${s.id}: hard risk must be HEAVY`);
      }
    }
  });

  // Migrations are always a hard schema surface.
  test('every migration sample expects HEAVY', () => {
    for (const s of SAMPLES.filter(s => s.category === 'migration')) {
      assert.strictEqual(s.expected_lane, 'HEAVY', `${s.id}: migration must be HEAVY`);
    }
  });

  // noise = a risky word in a non-risky context (docs/help/marketing). Must NOT
  // be force-escalated — otherwise the router cries wolf and users disable it.
  test('noise risk hits never force HEAVY', () => {
    for (const s of SAMPLES) {
      if (s.risk.expected_strength === 'noise') {
        assert.notStrictEqual(s.expected_lane, 'HEAVY', `${s.id}: noise must not force HEAVY`);
      }
    }
  });

  // The core Fable5 guard: unknown/low-confidence conservatively lands on
  // MEDIUM — never LIGHT. Proven by the runtime-gate rows (deliberately vague).
  test('low-confidence / unknown samples land on MEDIUM, never LIGHT', () => {
    for (const s of SAMPLES.filter(s => s.confidence === 'low')) {
      assert.strictEqual(s.expected_lane, 'MEDIUM', `${s.id}: unknown must conservatively be MEDIUM`);
    }
  });

  // ...and the counterweight: LIGHT must remain reachable for genuinely small
  // work, or the conservative default has swallowed the LIGHT lane entirely.
  test('LIGHT is still reachable — pure-light samples route to LIGHT', () => {
    const pureLight = SAMPLES.filter(s => s.category === 'pure-light');
    assert.ok(pureLight.length >= 1, 'need at least one pure-light sample');
    for (const s of pureLight) {
      assert.strictEqual(s.expected_lane, 'LIGHT', `${s.id}: pure-light must be LIGHT`);
    }
    const lightCount = SAMPLES.filter(s => s.expected_lane === 'LIGHT').length;
    assert.ok(lightCount >= 3, `LIGHT lane looks swallowed — only ${lightCount} LIGHT samples`);
  });

  // All three lanes must be exercised by the dataset.
  test('dataset exercises all three lanes', () => {
    for (const lane of ['LIGHT', 'MEDIUM', 'HEAVY']) {
      assert.ok(SAMPLES.some(s => s.expected_lane === lane), `no sample routes to ${lane}`);
    }
  });
});

// ─── Where the behavioral gate lives ────────────────────────────────────────
//
// The router has two layers (design R2 C1):
//   - Deterministic evidence layer (route.size-classify / route.risk-scan) —
//     unit-testable. The GOLDEN GATE that runs every sample's expected risk
//     strength through the real scanner lives in the SDK vitest suite:
//       sdk/src/query/route-size-classify.test.ts
//         → "route matrix — deterministic risk evidence (golden gate)"
//   - LLM judgment layer (gsd-do) — decides the final lane + confidence. This is
//     not deterministically unit-testable; `expected_lane` is enforced here as
//     dataset invariants (above) and validated end-to-end via gsd-do's prompt,
//     not CI.
//
// This CJS file's job is to lock the dataset's shape, coverage, and invariants.
