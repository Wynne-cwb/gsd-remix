/**
 * Stolen-parts anchor guardrail — Phase 0 (impl plan 0.3).
 *
 * Design D2/L2 requires every borrowed convention to have a local spec anchor so
 * implementation references the repo, not external originals. This locks that
 * get-shit-done/references/stolen-parts.md enumerates all 9 parts and states the
 * "no WebFetch to expand scope" rule. If a part is dropped, this trips.
 */

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const DOC = fs.readFileSync(
  path.join(__dirname, '..', 'get-shit-done', 'references', 'stolen-parts.md'),
  'utf-8'
);

// The 9 parts from the design's 零件落点对照表 — each must have a numbered section.
const PARTS = [
  { n: 1, kw: /one-sentence-diff/i },
  { n: 2, kw: /pass\/fail signal/i },
  { n: 3, kw: /EARS/ },
  { n: 4, kw: /RED-GREEN/ },
  { n: 5, kw: /Harper step-sizing/i },
  { n: 6, kw: /multi-lens architecture/i },
  { n: 7, kw: /impact-weighted findings/i },
  { n: 8, kw: /two-axis structured review/i },
  { n: 9, kw: /adversarial self-review lenses/i },
];

describe('stolen-parts anchor doc', () => {
  for (const p of PARTS) {
    test(`part ${p.n} is anchored`, () => {
      assert.match(DOC, new RegExp(`##\\s*${p.n}\\.`), `missing section heading ## ${p.n}.`);
      assert.match(DOC, p.kw, `part ${p.n} keyword not found`);
    });
  }

  test('each part states its landing point in GSD', () => {
    const landsIn = (DOC.match(/\*\*Lands in:\*\*/g) || []).length;
    assert.ok(landsIn >= PARTS.length, `only ${landsIn} "Lands in" anchors; expected >= ${PARTS.length}`);
  });

  test('no-WebFetch-to-expand-scope rule is stated (R2 L2)', () => {
    assert.match(DOC, /do \*\*not\*\* WebFetch/i, 'the D2/L2 no-external-refetch rule must be explicit');
  });
});
