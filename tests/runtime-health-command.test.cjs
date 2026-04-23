/**
 * Structural coverage for /gsd-health runtime mode.
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const COMMAND_PATH = path.join(__dirname, '..', 'commands', 'gsd', 'health.md');
const WORKFLOW_PATH = path.join(__dirname, '..', 'get-shit-done', 'workflows', 'health.md');

describe('/gsd-health runtime mode', () => {
  test('command documents --runtime in the argument hint', () => {
    const content = fs.readFileSync(COMMAND_PATH, 'utf-8');
    assert.ok(content.includes('--runtime'), 'health command should document --runtime');
  });

  test('workflow parses --runtime and calls runtime.health', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    assert.ok(content.includes('RUNTIME_FLAG'), 'health workflow should parse a runtime flag');
    assert.ok(content.includes('gsd-remix-sdk query runtime.health'), 'health workflow should invoke runtime.health');
  });

  test('workflow guards gsd-remix-sdk before its first query', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const runtimeCall = content.indexOf('gsd-remix-sdk query runtime.health');
    assert.ok(runtimeCall !== -1, 'health workflow should invoke runtime.health');

    const checkIndex = content.lastIndexOf('command -v gsd-remix-sdk', runtimeCall);
    assert.ok(checkIndex !== -1, 'health workflow should guard gsd-remix-sdk before runtime.health');

    const preamble = content.slice(checkIndex, runtimeCall);
    const hasInstallHint =
      preamble.includes('@gsd-remix/sdk') ||
      preamble.includes('gsd-update') ||
      preamble.includes('/gsd-update');
    assert.ok(hasInstallHint, 'health workflow preflight should include install/update guidance');
  });
});
