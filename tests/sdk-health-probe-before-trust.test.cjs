/**
 * Static guard: installSdkIfNeeded() must not trust a `gsd-remix-sdk` bin found
 * on PATH without probing that it actually loads.
 *
 * Why: a prior install can leave the shim on PATH while its dist/cli.js is
 * missing, silently breaking every /gsd-* SDK query. `resolveGsdRemixSdk()`
 * only proves a bin is on PATH — the installer must run a `sdk.health` probe
 * and rebuild from source when it fails, instead of printing "already installed"
 * and returning.
 *
 * The full SDK install path has E2E coverage in .github/workflows/install-smoke.yml;
 * this is a cheap source-level regression guard for the probe.
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'bin', 'install.js'), 'utf8');

describe('sdk health probe before trusting an on-PATH bin', () => {
  test('installSdkIfNeeded probes sdk.health before the "already installed" fast path', () => {
    const start = SRC.indexOf('function installSdkIfNeeded');
    assert.ok(start !== -1, 'installSdkIfNeeded() not found in bin/install.js');
    // Bound the search to the resolve→success-log region of the function.
    const region = SRC.slice(start, start + 2000);

    const resolveIdx = region.indexOf('resolveGsdRemixSdk()');
    const probeIdx = region.indexOf("'sdk.health'");
    const alreadyIdx = region.indexOf('already installed');

    assert.ok(resolveIdx !== -1, 'expected a resolveGsdRemixSdk() call');
    assert.ok(probeIdx !== -1, "expected a 'sdk.health' probe of the resolved bin");
    assert.ok(alreadyIdx !== -1, 'expected the "already installed" success log');

    // Probe must sit between resolving the bin and trusting it.
    assert.ok(
      resolveIdx < probeIdx && probeIdx < alreadyIdx,
      'the sdk.health probe must run after resolveGsdRemixSdk() and before the "already installed" log'
    );

    // The success path must be gated on the probe's exit status, and a failing
    // probe must fall through (rebuild), not return.
    assert.match(region, /probe\.status\s*===\s*0/, 'success must be gated on probe.status === 0');
    assert.match(region, /broken \(health probe failed\)/, 'a failed probe must announce a rebuild');
  });

  test('after rebuild, a still-broken resolved bin (shadowing shim) is re-probed and warned, not reported as success', () => {
    const start = SRC.indexOf('function installSdkIfNeeded');
    const region = SRC.slice(start);
    // The post-rebuild success log must be gated on a re-probe (postProbe), and a
    // failing re-probe must warn about a shadowing launcher rather than claim success.
    assert.match(region, /postProbe\.status\s*===\s*0/, 'post-rebuild success must be gated on a re-probe');
    assert.match(region, /shadows the working build/i, 'a shadowing shim must be reported, not silently trusted');
    // The false-success form (unconditional success on any resolved bin) must be gone.
    assert.ok(
      !/const resolved = resolveGsdRemixSdk\(\);\s*\n\s*if \(resolved\) \{\s*\n\s*console\.log\([^\n]*Built and installed/.test(region),
      'must not print "Built and installed" unconditionally when a bin resolves',
    );
  });
});
