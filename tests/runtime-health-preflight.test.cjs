/**
 * Structural regression coverage for runtime-health preflight on main workflows.
 *
 * These workflows must guard `gsd-sdk` before the first query, and they must
 * run `runtime.health` before their main init query so broken installs fail
 * fast with a deterministic fix path instead of degrading later.
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CASES = [
  {
    label: 'discuss-phase',
    file: path.join(__dirname, '..', 'get-shit-done', 'workflows', 'discuss-phase.md'),
    initCall: 'gsd-sdk query init.phase-op',
  },
  {
    label: 'plan-phase',
    file: path.join(__dirname, '..', 'get-shit-done', 'workflows', 'plan-phase.md'),
    initCall: 'gsd-sdk query init.plan-phase',
  },
  {
    label: 'execute-phase',
    file: path.join(__dirname, '..', 'get-shit-done', 'workflows', 'execute-phase.md'),
    initCall: 'gsd-sdk query init.execute-phase',
  },
];

describe('runtime-health workflow preflight', () => {
  for (const entry of CASES) {
    test(`${entry.label} checks for gsd-sdk before the first query`, () => {
      assert.ok(fs.existsSync(entry.file), `${entry.label} workflow should exist`);
      const content = fs.readFileSync(entry.file, 'utf-8');

      const runtimeCall = content.indexOf('gsd-sdk query runtime.health');
      assert.ok(runtimeCall !== -1, `${entry.label} should invoke runtime.health`);

      const checkIndex = content.lastIndexOf('command -v gsd-sdk', runtimeCall);
      const whichIndex = content.lastIndexOf('which gsd-sdk', runtimeCall);
      const guardIndex = Math.max(checkIndex, whichIndex);
      assert.ok(guardIndex !== -1, `${entry.label} should guard gsd-sdk before runtime.health`);

      const preamble = content.slice(guardIndex, runtimeCall);
      assert.ok(
        preamble.includes('command -v gsd-sdk') || preamble.includes('which gsd-sdk'),
        `${entry.label} must check for gsd-sdk in PATH before its first query.`,
      );

      const hasInstallHint =
        preamble.includes('@gsd-build/sdk') ||
        preamble.includes('gsd-update') ||
        preamble.includes('/gsd-update');
      assert.ok(
        hasInstallHint,
        `${entry.label} preflight must point users to npm install -g @gsd-build/sdk or /gsd-update.`,
      );
    });

    test(`${entry.label} runs runtime.health before its init query`, () => {
      const content = fs.readFileSync(entry.file, 'utf-8');
      const runtimeCall = content.indexOf('gsd-sdk query runtime.health');
      const initCall = content.indexOf(entry.initCall);

      assert.ok(runtimeCall !== -1, `${entry.label} should invoke runtime.health`);
      assert.ok(initCall !== -1, `${entry.label} should invoke its init query`);
      assert.ok(
        runtimeCall < initCall,
        `${entry.label} must run runtime.health before ${entry.initCall}.`,
      );
    });
  }
});
