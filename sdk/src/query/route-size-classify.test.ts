import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { classifyEvidence, routeSizeClassify } from './route-size-classify.js';
import { scanRisk, dominantStrength } from './route-risk-scan.js';

describe('classifyEvidence — evidence only, no lane', () => {
  it('reports no risk + no unknowns for a clear single-file edit', () => {
    const e = classifyEvidence('change the primary button color to blue', ['src/components/Button.css']);
    expect(e.max_risk_strength).toBe('none');
    expect(e.surface_count).toBe(0);
    expect(e.candidate_files.count).toBe(1);
    expect(e.unknowns).toHaveLength(0);
  });

  it('marks vague, path-less scope as unknown (justifies MEDIUM floor)', () => {
    const e = classifyEvidence('improve the checkout flow', []);
    expect(e.unknowns).toContain('no_candidate_files');
    expect(e.unknowns).toContain('vague_scope');
  });

  it('surfaces hard risk + surface list for a high-risk task', () => {
    const e = classifyEvidence('add a stripe webhook for payment.succeeded', ['src/webhooks/stripe.js']);
    expect(e.max_risk_strength).toBe('hard');
    expect(e.hard_surfaces).toContain('webhook');
    expect(e.surface_count).toBeGreaterThanOrEqual(1);
  });

  it('never emits a lane field (evidence layer only)', () => {
    const e = classifyEvidence('add pagination to the products list', ['src/api/products.js', 'src/ui/List.jsx']);
    expect(e).not.toHaveProperty('lane');
    expect(e).not.toHaveProperty('recommended_lane');
  });
});

describe('routeSizeClassify handler', () => {
  it('throws Validation when empty', async () => {
    await expect(routeSizeClassify([], '/tmp')).rejects.toThrow(/requires a description/);
  });
});

// ─── Golden gate: the Phase 0 acceptance matrix, at the deterministic layer ──
//
// The matrix (tests/fixtures/route-matrix.json) is the router's golden dataset.
// LANE is decided by the LLM judgment layer in gsd-do and is not unit-testable,
// but each sample's expected RISK STRENGTH is deterministic — this asserts the
// scanner reproduces it for every sample. This is the enforced Phase 1 gate.
const MATRIX = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../tests/fixtures/route-matrix.json', import.meta.url)), 'utf-8'),
) as { samples: Array<{
  id: string; description: string; candidate_paths: string[];
  risk: { expected_strength: string };
}> };

describe('route matrix — deterministic risk evidence (golden gate)', () => {
  for (const s of MATRIX.samples) {
    it(`${s.id} → risk ${s.risk.expected_strength}`, () => {
      const hits = scanRisk(s.description, s.candidate_paths);
      expect(dominantStrength(hits)).toBe(s.risk.expected_strength);
    });
  }
});
