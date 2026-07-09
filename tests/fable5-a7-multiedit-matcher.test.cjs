/**
 * Fable5 A7 regression guard.
 *
 * The prompt-injection / read / workflow / phase-boundary guard hooks inspect
 * MultiEdit payloads (their scripts extract from `edits[].new_string`), but the
 * installer originally registered them with a `Write|Edit` matcher — so the
 * PreToolUse/PostToolUse hooks never fired on MultiEdit and the MultiEdit branch
 * in each script was dead. This guard pins two things at the install.js source
 * level:
 *   1. all four edit-content guards register a matcher that includes MultiEdit;
 *   2. a migration path upgrades the legacy `Write|Edit` matcher on re-install,
 *      so already-installed users are not left uncovered.
 *
 * Static (source-text) checks, matching the style of the other install.js
 * registration guards (workflow-guard-registration, hooks-opt-in).
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'bin', 'install.js'), 'utf8');

// The four edit-content guards + the marker text that anchors each push block.
const EDIT_GUARDS = [
  { name: 'prompt guard', command: 'promptGuardCommand' },
  { name: 'read guard', command: 'readGuardCommand' },
  { name: 'workflow guard', command: 'workflowGuardCommand' },
  { name: 'phase boundary', command: 'phaseBoundaryCommand' },
];

describe('Fable5 A7: edit-content guards match MultiEdit', () => {
  for (const guard of EDIT_GUARDS) {
    test(`${guard.name} push block registers a MultiEdit-inclusive matcher`, () => {
      // Grab the push block whose hooks entry references this guard's command.
      const idx = SRC.indexOf(`command: ${guard.command}`);
      assert.ok(idx !== -1, `expected a push block wiring ${guard.command}`);
      // Look back a short window to the matcher that precedes the command.
      const window = SRC.slice(Math.max(0, idx - 400), idx);
      const matcher = window.match(/matcher:\s*'([^']+)'/g);
      assert.ok(matcher && matcher.length, `expected a matcher near ${guard.command}`);
      const last = matcher[matcher.length - 1];
      assert.match(
        last,
        /MultiEdit/,
        `${guard.name} matcher must include MultiEdit (found ${last})`,
      );
    });
  }

  test('no edit-content guard is registered with a bare Write|Edit matcher', () => {
    // The exact legacy value must be gone from fresh registrations. It may only
    // survive as the `=== 'Write|Edit'` comparison inside the migration helper.
    const bareRegistrations = SRC.match(/matcher:\s*'Write\|Edit'(?!\|)/g) || [];
    assert.strictEqual(
      bareRegistrations.length,
      0,
      'no hook should register the bare "Write|Edit" matcher; use "Write|Edit|MultiEdit"',
    );
  });

  test('a migration widens the legacy Write|Edit matcher on re-install', () => {
    assert.match(
      SRC,
      /migrateEditMatcher/,
      'installer must define a migrateEditMatcher helper for already-installed users',
    );
    assert.match(
      SRC,
      /entry\.matcher\s*===\s*'Write\|Edit'/,
      'migration must target the exact legacy matcher value',
    );
    assert.match(
      SRC,
      /entry\.matcher\s*=\s*'Write\|Edit\|MultiEdit'/,
      'migration must upgrade the matcher to include MultiEdit',
    );
    // Every edit-content guard must actually call the migration in its else path.
    for (const hook of ['gsd-prompt-guard', 'gsd-read-guard', 'gsd-workflow-guard', 'gsd-phase-boundary']) {
      assert.ok(
        SRC.includes(`migrateEditMatcher(settings.hooks[`) && SRC.includes(`'${hook}')`),
        `expected a migrateEditMatcher call for ${hook}`,
      );
    }
  });
});
