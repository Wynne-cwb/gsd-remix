#!/usr/bin/env node
'use strict';

/**
 * Rebuild and reinstall the bundled GSD Remix SDK without depending on the
 * gsd-remix-sdk binary. This is the runtime repair path used when the SDK CLI is
 * missing, stale, or otherwise unable to answer health queries.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SDK_BIN = 'gsd-remix-sdk';

function log(message = '') {
  console.log(message);
}

function fail(message, code = 1) {
  console.error('');
  console.error(`GSD Remix SDK repair failed: ${message}`);
  process.exit(code);
}

function run(command, args, options = {}) {
  log(`> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: false,
    ...options,
  });
  if (result.error) {
    fail(result.error.message);
  }
  if (result.status !== 0) {
    fail(`Command failed with exit ${result.status}: ${command} ${args.join(' ')}`);
  }
}

function resolveCommand(command) {
  if (process.platform === 'win32') {
    const result = spawnSync('where', [command], { encoding: 'utf-8' });
    if (result.status === 0 && result.stdout.trim()) {
      return result.stdout.trim().split(/\r?\n/)[0].trim();
    }
    return null;
  }

  const result = spawnSync('sh', ['-c', `command -v ${command}`], { encoding: 'utf-8' });
  if (result.status === 0 && result.stdout.trim()) {
    return result.stdout.trim();
  }
  return null;
}

function detectShellRc() {
  const shell = process.env.SHELL || '';
  const home = process.env.HOME || '~';
  if (/\/zsh$/.test(shell)) return path.join(home, '.zshrc');
  if (/\/bash$/.test(shell)) return path.join(home, '.bashrc');
  if (/\/fish$/.test(shell)) return path.join(home, '.config', 'fish', 'config.fish');
  return path.join(home, '.profile');
}

function parseVersion(input) {
  const match = String(input).trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return null;
  return [Number(match[1] || 0), Number(match[2] || 0), Number(match[3] || 0)];
}

function minNodeFromRange(range) {
  const match = String(range || '').trim().match(/^>=\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return null;
  return [Number(match[1] || 0), Number(match[2] || 0), Number(match[3] || 0)];
}

function compareVersions(left, right) {
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return 0;
}

function assertNodeSupported(pkg) {
  const required = pkg.engines && pkg.engines.node;
  const minimum = minNodeFromRange(required);
  if (!minimum) return;

  const actual = parseVersion(process.version);
  if (!actual || compareVersions(actual, minimum) < 0) {
    fail(`Current Node ${process.version} does not satisfy ${required}. Switch Node versions and retry.`);
  }
}

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function npmPrefix(npmCmd) {
  const result = spawnSync(npmCmd, ['config', 'get', 'prefix'], { encoding: 'utf-8' });
  if (result.status !== 0) return null;
  return (result.stdout || '').trim() || null;
}

function globalModulesDir(prefix) {
  if (!prefix) return null;
  return process.platform === 'win32'
    ? path.join(prefix, 'node_modules')
    : path.join(prefix, 'lib', 'node_modules');
}

function chmodInstalledCli(npmCmd, sdkPackageName) {
  const prefix = npmPrefix(npmCmd);
  const modulesDir = globalModulesDir(prefix);
  if (!modulesDir) return;

  const cliPath = path.join(modulesDir, sdkPackageName, 'dist', 'cli.js');
  try {
    fs.chmodSync(cliPath, 0o755);
  } catch {
    // Non-fatal. The final PATH verification catches real install failures.
  }
}

function reportOffPath(npmCmd) {
  const prefix = npmPrefix(npmCmd);
  const binDir = prefix
    ? (process.platform === 'win32' ? prefix : path.join(prefix, 'bin'))
    : null;

  console.error('');
  console.error(`Built and installed ${SDK_BIN}, but it is not visible on PATH.`);
  if (binDir) {
    console.error(`Installed npm binaries are expected under: ${binDir}`);
    if (process.platform !== 'win32') {
      const rc = detectShellRc();
      console.error(`Add it with: echo 'export PATH="${binDir}:$PATH"' >> ${rc}`);
      console.error(`Then run: source ${rc}`);
    }
  }
  console.error(`Verify with: command -v ${SDK_BIN}`);
  process.exit(2);
}

function main() {
  const sdkDir = path.resolve(process.env.GSD_REMIX_SDK_DIR || path.join(__dirname, '..', 'sdk'));
  const packageJsonPath = path.join(sdkDir, 'package.json');

  if (!fs.existsSync(packageJsonPath)) {
    fail(`Bundled SDK source not found at ${sdkDir}. Re-run npx gsd-remix@latest to refresh runtime assets.`);
  }

  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  assertNodeSupported(pkg);

  const npmCmd = npmCommand();
  log('GSD Remix SDK repair');
  log(`SDK source: ${sdkDir}`);
  log('');

  run(npmCmd, ['install'], { cwd: sdkDir });
  run(npmCmd, ['run', 'build'], { cwd: sdkDir });
  run(npmCmd, ['install', '-g', '.'], { cwd: sdkDir });
  chmodInstalledCli(npmCmd, pkg.name || '@gsd-remix/sdk');

  const resolved = resolveCommand(SDK_BIN);
  if (!resolved) {
    reportOffPath(npmCmd);
  }

  log('');
  log(`GSD Remix SDK repaired: ${resolved}`);
}

main();
