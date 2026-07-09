/**
 * Parity guard (Fable5 E6): /gsd-help must list every shipped command.
 *
 * help.md bills itself as "the complete GSD command reference" and the README
 * points users at flagship commands (/gsd-autonomous, /gsd-next, /gsd-health).
 * Before this guard, help.md had drifted to omit 11 of 37 commands. This test
 * derives the roster from commands/gsd/*.md and asserts each `/gsd-<name>`
 * token appears in help.md, so the reference cannot silently fall behind.
 */
'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const COMMANDS_DIR = path.join(ROOT, 'commands', 'gsd');
const HELP_MD = path.join(ROOT, 'get-shit-done', 'workflows', 'help.md');

describe('help.md command coverage (#E6)', () => {
  test('every commands/gsd/*.md is referenced in help.md', () => {
    const roster = fs
      .readdirSync(COMMANDS_DIR)
      .filter(f => f.endsWith('.md'))
      .map(f => '/gsd-' + f.replace(/\.md$/, ''));

    const help = fs.readFileSync(HELP_MD, 'utf-8');
    const missing = roster.filter(cmd => !help.includes(cmd));

    assert.strictEqual(
      missing.length,
      0,
      [
        '/gsd-help must document every shipped command.',
        'Missing from help.md:',
        ...missing.map(m => '  ' + m),
      ].join('\n'),
    );
  });
});
