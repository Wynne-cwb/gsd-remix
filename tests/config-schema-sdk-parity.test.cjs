/**
 * CJS ↔ SDK config-key allowlist parity (B1).
 *
 * The valid-config-key allowlist exists twice: canonically in
 * `get-shit-done/bin/lib/config-schema.cjs` (consumed by config.cjs and the
 * CJS config-set validator) and, ported, in `sdk/src/query/config-mutation.ts`
 * (the SDK `config.set` validator). They drifted — the SDK was missing 14 keys
 * the CJS side accepts, so `config set <key>` through the SDK spuriously
 * rejected valid keys.
 *
 * This guard fails on ANY divergence in either direction. The SDK side is read
 * from TS SOURCE (not the built dist) so the check does not depend on
 * `sdk/dist` being freshly built when the CJS suite runs.
 *
 * Uses node:test + node:assert/strict (NOT Jest).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { VALID_CONFIG_KEYS, DYNAMIC_KEY_PATTERNS } = require('../get-shit-done/bin/lib/config-schema.cjs');
const SDK_SRC = path.join(__dirname, '..', 'sdk', 'src', 'query', 'config-mutation.ts');

/** Extract the string literals inside the `VALID_CONFIG_KEYS = new Set([ ... ])` block. */
function extractSdkKeys(source) {
  const start = source.indexOf('const VALID_CONFIG_KEYS = new Set([');
  assert.notEqual(start, -1, 'config-mutation.ts must declare `const VALID_CONFIG_KEYS = new Set([`');
  const close = source.indexOf(']);', start);
  assert.notEqual(close, -1, 'VALID_CONFIG_KEYS Set literal must be closed with `]);`');
  const block = source.slice(start, close);
  return new Set([...block.matchAll(/'([^']+)'/g)].map((m) => m[1]));
}

describe('config-key allowlist CJS ↔ SDK parity (B1)', () => {
  const source = fs.readFileSync(SDK_SRC, 'utf-8');
  const sdkKeys = extractSdkKeys(source);
  const cjsKeys = new Set(VALID_CONFIG_KEYS);

  test('SDK accepts every key the CJS allowlist accepts', () => {
    const missingInSdk = [...cjsKeys].filter((k) => !sdkKeys.has(k));
    assert.deepEqual(missingInSdk, [], `SDK config-mutation.ts is missing keys: ${missingInSdk.join(', ')}`);
  });

  test('SDK does not accept keys absent from the CJS allowlist', () => {
    const extraInSdk = [...sdkKeys].filter((k) => !cjsKeys.has(k));
    assert.deepEqual(extraInSdk, [], `SDK config-mutation.ts has keys not in config-schema.cjs: ${extraInSdk.join(', ')}`);
  });

  test('the two allowlists have identical size', () => {
    assert.equal(sdkKeys.size, cjsKeys.size, 'allowlist sizes differ — a key was added to one side only');
  });

  test('SDK isValidConfigKey covers every CJS dynamic key pattern', () => {
    // Map each CJS dynamic-pattern description to the identifying prefix the
    // SDK regex must contain (both sides accept `<prefix>.<name>`).
    const prefixByDescription = {
      'agent_skills.<agent-type>': 'agent_skills',
      'features.<feature_name>': 'features',
      'claude_md_assembly.blocks.<section>': 'claude_md_assembly\\.blocks',
    };
    for (const { description } of DYNAMIC_KEY_PATTERNS) {
      const prefix = prefixByDescription[description];
      assert.ok(prefix, `unmapped CJS dynamic pattern: ${description} — add it to this test and to SDK isValidConfigKey`);
      assert.ok(
        source.includes(`^${prefix}\\.`),
        `SDK isValidConfigKey missing dynamic pattern for "${description}" (expected regex prefix ^${prefix}\\.)`,
      );
    }
  });
});
