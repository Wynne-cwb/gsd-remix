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
