import { describe, it, expect } from 'vitest';
import {
  scanRisk, dominantStrength, parseRiskArgs, routeRiskScan,
} from './route-risk-scan.js';

describe('scanRisk — strength classification', () => {
  it('flags session-persistence as hard even without the word "auth"', () => {
    const hits = scanRisk('let users stay logged in across app restarts', ['src/session/store.js']);
    expect(dominantStrength(hits)).toBe('hard');
    expect(hits.some(h => h.surface === 'auth/session/token')).toBe(true);
  });

  it('flags a schema migration as hard via the migrations/ path', () => {
    const hits = scanRisk('add a nullable archived_at column to the orders table', ['migrations/']);
    expect(dominantStrength(hits)).toBe('hard');
    expect(hits.some(h => h.surface === 'migration/schema')).toBe(true);
  });

  it('does NOT flag UI "column sorting" as a schema migration', () => {
    const hits = scanRisk('add column sorting to the dashboard table', ['src/components/DashboardTable.jsx']);
    expect(hits.some(h => h.surface === 'migration/schema')).toBe(false);
  });

  it('does NOT flag a framework migration ("migrate Redux to Zustand") as schema', () => {
    const hits = scanRisk('migrate state management from Redux to Zustand', ['src/store/']);
    expect(hits.some(h => h.surface === 'migration/schema')).toBe(false);
  });

  it('downgrades a risky word in a docs-only context to noise', () => {
    const hits = scanRisk('fix a typo in the public API reference docs for /v1/orders', ['docs/api/orders.md']);
    expect(dominantStrength(hits)).toBe('noise');
  });

  it('treats an Authorization-header formatting change as soft, not hard', () => {
    const hits = scanRisk('refactor the helper that formats the Authorization header string', ['src/http/headers.js']);
    expect(dominantStrength(hits)).toBe('soft');
  });

  it('returns no hits for a plain doc typo', () => {
    const hits = scanRisk('fix a typo in the README heading', ['README.md']);
    expect(hits).toHaveLength(0);
    expect(dominantStrength(hits)).toBe('none');
  });

  it('flags PII logging even though it sounds like one log line', () => {
    const hits = scanRisk('log the full request body to help debug the checkout error', ['src/middleware/logger.js']);
    expect(hits.some(h => h.surface === 'PII/logging' && h.strength === 'hard')).toBe(true);
  });
});

// Regression: a stray docs/README/comment word must NOT downgrade a real code
// change to noise (that would let a mixed task slip past the Escalation 铁律).
describe('scanRisk — noise downgrade does not bypass real code changes', () => {
  it('keeps auth hard when docs word mixes with a real code path', () => {
    const hits = scanRisk('update docs and change token validation logic', ['src/token-validation.ts']);
    expect(dominantStrength(hits)).toBe('hard');
    expect(hits.some(h => h.surface === 'auth/session/token' && h.strength === 'hard')).toBe(true);
  });

  it('keeps webhook hard when README mixes with a real handler change', () => {
    const hits = scanRisk('fix README and add webhook handler', ['src/handlers/stripe.ts']);
    expect(dominantStrength(hits)).toBe('hard');
  });

  it('keeps tenant boundary hard when a comment edit mixes with an org_id filter', () => {
    const hits = scanRisk('fix comment and add org_id tenant filter', ['src/api/invoices.ts']);
    expect(hits.some(h => h.surface === 'tenant/org boundary' && h.strength === 'hard')).toBe(true);
  });

  it('still treats a docs-only change (all doc paths) as noise', () => {
    // docs-only path, risky word ("token") only in prose → noise (not a code change).
    const hits = scanRisk('reword the token-expiry note', ['docs/notes.md']);
    expect(dominantStrength(hits)).toBe('noise');
  });

  it('still treats a no-path copy edit as noise', () => {
    const hits = scanRisk('fix a typo in the billing copy', []);
    expect(dominantStrength(hits)).toBe('noise');
  });

  // No candidate paths: a docs word must NOT downgrade a real code-action change.
  it('keeps a no-path mixed change hard when a code-action signal is present', () => {
    expect(dominantStrength(scanRisk('update docs and change token validation logic', []))).toBe('hard');
    expect(dominantStrength(scanRisk('fix comment and add org_id tenant filter', []))).toBe('hard');
    expect(dominantStrength(scanRisk('fix README and add webhook handler', []))).toBe('hard');
  });

  it('keeps a no-path pure-copy edit as noise (no code-action signal)', () => {
    expect(dominantStrength(scanRisk('reword the token section of the landing copy', []))).toBe('noise');
  });
});

describe('scanRisk — PII/logging matches data+logging in either order', () => {
  it('flags "log the request body"', () => {
    const hits = scanRisk('log the request body', ['src/middleware/logger.ts']);
    expect(hits.some(h => h.surface === 'PII/logging' && h.strength === 'hard')).toBe(true);
  });
  it('flags "add request body logging" (logging verb after the data)', () => {
    const hits = scanRisk('add request body logging', ['src/middleware/logger.ts']);
    expect(hits.some(h => h.surface === 'PII/logging' && h.strength === 'hard')).toBe(true);
  });
});

describe('parseRiskArgs', () => {
  it('splits description from --paths (space and = forms)', () => {
    expect(parseRiskArgs(['add pagination', '--paths', 'a.js,b.js'])).toEqual({
      description: 'add pagination', paths: ['a.js', 'b.js'],
    });
    expect(parseRiskArgs(['fix bug', '--paths=x.ts, y.ts'])).toEqual({
      description: 'fix bug', paths: ['x.ts', 'y.ts'],
    });
  });
});

describe('routeRiskScan handler', () => {
  it('returns hits + max_strength', async () => {
    const { data } = await routeRiskScan(['add a stripe webhook handler', '--paths', 'src/webhooks/stripe.js'], '/tmp');
    expect(data).toMatchObject({ max_strength: 'hard' });
  });

  it('throws Validation when nothing is provided', async () => {
    await expect(routeRiskScan([], '/tmp')).rejects.toThrow(/requires a description/);
  });
});
