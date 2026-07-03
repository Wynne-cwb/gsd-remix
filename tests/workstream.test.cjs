/**
 * Workstream compat-layer regressions.
 *
 * The user-facing workstream commands were removed in the slim refactor,
 * but the passive path-resolution layer stays: `--ws` flag parsing,
 * `GSD_WORKSTREAM` env routing, `planningDir()` workstream awareness, and
 * active-workstream pointer validation in core.cjs. These tests keep that
 * layer honest without exercising the deleted subcommands.
 */

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');

// ─── planningDir / planningPaths env-var awareness ──────────────────────────

describe('planningDir workstream awareness via env var', () => {
  let tmpDir;

  before(() => {
    tmpDir = createTempProject();
    const wsDir = path.join(tmpDir, '.planning', 'workstreams', 'alpha');
    fs.mkdirSync(path.join(wsDir, 'phases'), { recursive: true });
    fs.writeFileSync(path.join(wsDir, 'STATE.md'), '# State\n**Status:** In progress\n**Current Phase:** 1\n');
    fs.writeFileSync(path.join(wsDir, 'ROADMAP.md'), '## Roadmap v1.0: Alpha\n### Phase 1: Setup\n');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'active-workstream'), 'alpha\n');
  });

  after(() => cleanup(tmpDir));

  test('state json returns workstream-scoped state when GSD_WORKSTREAM is set', () => {
    const result = runGsdTools(['state', 'json', '--raw'], tmpDir, { GSD_WORKSTREAM: 'alpha' });
    assert.ok(result.success, `state json failed: ${result.error}`);
    const data = JSON.parse(result.output);
    assert.ok(data.status || data.current_phase !== undefined, 'should return state data');
  });

  test('state json reads from flat .planning when no workstream set', () => {
    // Clear active-workstream so no auto-detection
    try { fs.unlinkSync(path.join(tmpDir, '.planning', 'active-workstream')); } catch {}
    const result = runGsdTools(['state', 'json', '--raw'], tmpDir, { GSD_WORKSTREAM: '' });
    // Should fail or return empty state since flat .planning/ has no STATE.md
    assert.ok(!result.success || result.output.includes('not found') || result.output === '{}',
      'should read from flat .planning/');
    // Restore
    fs.writeFileSync(path.join(tmpDir, '.planning', 'active-workstream'), 'alpha\n');
  });

  test('shared active-workstream pointer routes state when no env or flag given', () => {
    const result = runGsdTools(['state', 'json', '--raw'], tmpDir);
    assert.ok(result.success, `state json failed: ${result.error}`);
    const data = JSON.parse(result.output);
    assert.ok(data.status || data.current_phase !== undefined, 'pointer file should scope state to alpha');
  });

  test('--ws flag overrides GSD_WORKSTREAM env var', () => {
    const betaDir = path.join(tmpDir, '.planning', 'workstreams', 'beta');
    fs.mkdirSync(path.join(betaDir, 'phases'), { recursive: true });
    fs.writeFileSync(path.join(betaDir, 'STATE.md'), '# State\n**Status:** Beta active\n');

    const result = runGsdTools(['state', 'json', '--raw', '--ws', 'beta'], tmpDir, { GSD_WORKSTREAM: 'alpha' });
    assert.ok(result.success, `state json --ws beta failed: ${result.error}`);
  });
});

// ─── --ws flag integration ───────────────────────────────────────────────────

describe('gsd-tools --ws flag integration', () => {
  let tmpDir;

  before(() => {
    tmpDir = createTempProject();
    const wsDir = path.join(tmpDir, '.planning', 'workstreams', 'test-ws');
    fs.mkdirSync(path.join(wsDir, 'phases', '01-setup'), { recursive: true });
    fs.writeFileSync(path.join(wsDir, 'ROADMAP.md'),
      '## Roadmap v1.0: Test\n### Phase 1: Setup\nDo setup things.\n');
    fs.writeFileSync(path.join(wsDir, 'STATE.md'),
      '---\nmilestone: v1.0\n---\n# State\n**Status:** In progress\n**Current Phase:** 1 — Setup\n');
    fs.writeFileSync(path.join(wsDir, 'phases', '01-setup', 'PLAN.md'), '# Plan\n');
  });

  after(() => cleanup(tmpDir));

  test('find-phase resolves to workstream-scoped phases via --ws', () => {
    const result = runGsdTools(['find-phase', '1', '--raw', '--ws', 'test-ws'], tmpDir);
    assert.ok(result.success, `find-phase failed: ${result.error}`);
    assert.ok(result.output.includes('workstreams/test-ws'), `path should be workstream-scoped: ${result.output}`);
  });

  test('find-phase returns JSON with workstream path when not raw', () => {
    const result = runGsdTools(['find-phase', '1', '--ws', 'test-ws'], tmpDir);
    assert.ok(result.success, `find-phase failed: ${result.error}`);
    const data = JSON.parse(result.output);
    assert.ok(data.found, 'phase should be found');
    assert.ok(data.directory.includes('workstreams/test-ws'), `path should be workstream-scoped: ${data.directory}`);
  });
});

// ─── Path Traversal Rejection ────────────────────────────────────────────────

describe('path traversal rejection', () => {
  let tmpDir;

  before(() => {
    tmpDir = createTempProject();
    fs.writeFileSync(path.join(tmpDir, '.planning', 'PROJECT.md'), '# Project\n');
    const wsDir = path.join(tmpDir, '.planning', 'workstreams', 'legit');
    fs.mkdirSync(path.join(wsDir, 'phases'), { recursive: true });
    fs.writeFileSync(path.join(wsDir, 'STATE.md'), '# State\n');
  });

  after(() => cleanup(tmpDir));

  const maliciousNames = [
    '../../etc',
    '../foo',
    'ws/../../../passwd',
    'a/b',
    'ws name with spaces',
    '..',
    '.',
    'ws..traversal',
  ];

  describe('--ws flag rejects traversal attempts', () => {
    for (const name of maliciousNames) {
      test(`rejects --ws=${name}`, () => {
        const result = runGsdTools(['state', 'json', '--raw', '--ws', name], tmpDir);
        assert.ok(!result.success, `should reject --ws=${name}`);
        assert.ok(result.error.includes('Invalid workstream name'), `error should mention invalid name for: ${name}`);
      });
    }
  });

  describe('GSD_WORKSTREAM env var rejects traversal attempts', () => {
    for (const name of maliciousNames) {
      test(`rejects GSD_WORKSTREAM=${name}`, () => {
        const result = runGsdTools(['state', 'json', '--raw'], tmpDir, { GSD_WORKSTREAM: name });
        assert.ok(!result.success, `should reject GSD_WORKSTREAM=${name}`);
        assert.ok(result.error.includes('Invalid workstream name'), `error should mention invalid name for: ${name}`);
      });
    }
  });

  describe('getActiveWorkstream rejects poisoned active-workstream file', () => {
    const { getActiveWorkstream } = require('../get-shit-done/bin/lib/core.cjs');
    for (const name of maliciousNames) {
      test(`rejects poisoned file containing ${name}`, () => {
        fs.writeFileSync(path.join(tmpDir, '.planning', 'active-workstream'), name + '\n');
        assert.strictEqual(getActiveWorkstream(tmpDir), null, `should return null for poisoned name: ${name}`);
      });
    }

    test('cleanup: remove active-workstream file', () => {
      try { fs.unlinkSync(path.join(tmpDir, '.planning', 'active-workstream')); } catch {}
    });
  });

  describe('setActiveWorkstream rejects invalid names directly', () => {
    const { setActiveWorkstream } = require('../get-shit-done/bin/lib/core.cjs');
    for (const name of maliciousNames) {
      test(`throws for ${name}`, () => {
        assert.throws(
          () => setActiveWorkstream(tmpDir, name),
          { message: /Invalid workstream name/ },
          `should throw for: ${name}`
        );
      });
    }
  });
});
