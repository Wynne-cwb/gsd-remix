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
const REPAIR_SCRIPT_PATH = path.join(__dirname, '..', 'get-shit-done', 'bin', 'repair-sdk.cjs');

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

  test('workflow surfaces runtime identity in --runtime output', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    assert.ok(content.includes('runtime_identity'), 'health workflow should parse the runtime identity marker');
    assert.ok(content.includes('Distribution:'), 'health workflow should display the resolved distribution');
    assert.ok(content.includes('Identity:'), 'health workflow should display the identity marker path');
  });

  test('workflow guards gsd-remix-sdk before its first query', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const runtimeCall = content.indexOf('gsd-remix-sdk query runtime.health');
    assert.ok(runtimeCall !== -1, 'health workflow should invoke runtime.health');

    const checkIndex = content.lastIndexOf('command -v gsd-remix-sdk', runtimeCall);
    assert.ok(checkIndex !== -1, 'health workflow should guard gsd-remix-sdk before runtime.health');

    const preamble = content.slice(checkIndex, runtimeCall);
    const hasInstallHint =
      preamble.includes('/gsd-health --runtime --repair') ||
      preamble.includes('gsd-update') ||
      preamble.includes('/gsd-update');
    assert.ok(hasInstallHint, 'health workflow preflight should include install/update guidance');
  });

  test('workflow can run bundled SDK repair before querying runtime.health', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const repairCall = content.indexOf('node "$RUNTIME_REPAIR_SCRIPT"');
    const runtimeCall = content.indexOf('gsd-remix-sdk query runtime.health');

    assert.ok(content.includes('RUNTIME_REPAIR_SCRIPT'), 'health workflow should define the bundled repair script path');
    assert.ok(repairCall !== -1, 'health workflow should invoke the bundled repair script');
    assert.ok(runtimeCall !== -1, 'health workflow should still verify with runtime.health');
    assert.ok(repairCall < runtimeCall, 'runtime repair should run before runtime.health verification');
  });

  test('bundled SDK repair script exists and is Node executable', () => {
    const content = fs.readFileSync(REPAIR_SCRIPT_PATH, 'utf-8');
    assert.ok(content.startsWith('#!/usr/bin/env node'), 'repair script should be runnable with node');
    assert.ok(content.includes('npm') && content.includes('install'), 'repair script should rebuild the bundled SDK with npm');
    assert.ok(content.includes('gsd-remix-sdk'), 'repair script should verify the SDK binary');
  });
});
