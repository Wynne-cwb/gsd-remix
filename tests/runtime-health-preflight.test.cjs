/**
 * Structural regression coverage for runtime-health preflight on main workflows.
 *
 * These workflows must guard `gsd-remix-sdk` before the first query, and they must
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
    initCall: 'gsd-remix-sdk query init.phase-op',
  },
  {
    label: 'plan-phase',
    file: path.join(__dirname, '..', 'get-shit-done', 'workflows', 'plan-phase.md'),
    initCall: 'gsd-remix-sdk query init.plan-phase',
  },
  {
    label: 'execute-phase',
    file: path.join(__dirname, '..', 'get-shit-done', 'workflows', 'execute-phase.md'),
    initCall: 'gsd-remix-sdk query init.execute-phase',
  },
];

describe('runtime-health workflow preflight', () => {
  for (const entry of CASES) {
    test(`${entry.label} checks for gsd-remix-sdk before the first query`, () => {
      assert.ok(fs.existsSync(entry.file), `${entry.label} workflow should exist`);
      const content = fs.readFileSync(entry.file, 'utf-8');

      const runtimeCall = content.indexOf('gsd-remix-sdk query runtime.health');
      assert.ok(runtimeCall !== -1, `${entry.label} should invoke runtime.health`);

      const checkIndex = content.lastIndexOf('command -v gsd-remix-sdk', runtimeCall);
      const whichIndex = content.lastIndexOf('which gsd-remix-sdk', runtimeCall);
      const guardIndex = Math.max(checkIndex, whichIndex);
      assert.ok(guardIndex !== -1, `${entry.label} should guard gsd-remix-sdk before runtime.health`);

      const preamble = content.slice(guardIndex, runtimeCall);
      assert.ok(
        preamble.includes('command -v gsd-remix-sdk') || preamble.includes('which gsd-remix-sdk'),
        `${entry.label} must check for gsd-remix-sdk in PATH before its first query.`,
      );

      const hasInstallHint =
        preamble.includes('/gsd-health --runtime --repair') ||
        preamble.includes('gsd-update') ||
        preamble.includes('/gsd-update');
      assert.ok(
        hasInstallHint,
        `${entry.label} preflight must point users to /gsd-health --runtime --repair or /gsd-update.`,
      );
    });

    test(`${entry.label} runs runtime.health before its init query`, () => {
      const content = fs.readFileSync(entry.file, 'utf-8');
      const runtimeCall = content.indexOf('gsd-remix-sdk query runtime.health');
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
