import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const SDK_PACKAGE_JSON_PATH = fileURLToPath(new URL('../package.json', import.meta.url));
const ROOT_PACKAGE_JSON_PATH = fileURLToPath(new URL('../../package.json', import.meta.url));
const BUNDLED_GSD_TOOLS_PATH = fileURLToPath(
  new URL('../../get-shit-done/bin/gsd-tools.cjs', import.meta.url),
);

export type RuntimeHealthLevel = 'pass' | 'warn' | 'block';
export type RuntimeHealthSource = 'bundled' | 'project' | 'user' | 'custom' | 'missing';

export interface RuntimeHealthCheck {
  code: string;
  level: RuntimeHealthLevel;
  message: string;
  detail?: string;
  fix?: string;
  path?: string;
  source?: RuntimeHealthSource;
}

export interface RuntimeHealthCandidate {
  path: string;
  source: Exclude<RuntimeHealthSource, 'missing'>;
}

export interface RuntimeHealthResult {
  passed: boolean;
  node_version: string;
  required_node_range: string | null;
  gsd_tools_path: string | null;
  gsd_tools_source: RuntimeHealthSource;
  legacy_bridge_available: boolean;
  checks: RuntimeHealthCheck[];
  blockers: RuntimeHealthCheck[];
  warnings: RuntimeHealthCheck[];
}

export interface RuntimeHealthOptions {
  nodeVersion?: string;
  requiredNodeRange?: string | null;
  gsdToolsCandidates?: RuntimeHealthCandidate[];
}

interface PackageMeta {
  engines?: {
    node?: string;
  };
}

interface VersionTuple {
  major: number;
  minor: number;
  patch: number;
}

function parseVersionTuple(input: string): VersionTuple | null {
  const match = input.trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) {
    return null;
  }

  return {
    major: Number(match[1] ?? 0),
    minor: Number(match[2] ?? 0),
    patch: Number(match[3] ?? 0),
  };
}

function compareVersionTuple(left: VersionTuple, right: VersionTuple): number {
  if (left.major !== right.major) {
    return left.major - right.major;
  }
  if (left.minor !== right.minor) {
    return left.minor - right.minor;
  }
  return left.patch - right.patch;
}

function parseMinimumNodeRange(range: string): VersionTuple | null {
  const match = range.trim().match(/^>=\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) {
    return null;
  }

  return {
    major: Number(match[1] ?? 0),
    minor: Number(match[2] ?? 0),
    patch: Number(match[3] ?? 0),
  };
}

async function loadRequiredNodeRange(): Promise<string | null> {
  for (const packagePath of [SDK_PACKAGE_JSON_PATH, ROOT_PACKAGE_JSON_PATH]) {
    try {
      const parsed = JSON.parse(await readFile(packagePath, 'utf-8')) as PackageMeta;
      if (parsed.engines?.node) {
        return parsed.engines.node;
      }
    } catch {
      // Ignore missing package metadata and continue probing.
    }
  }

  return null;
}

function defaultGsdToolsCandidates(projectDir: string): RuntimeHealthCandidate[] {
  return [
    { path: BUNDLED_GSD_TOOLS_PATH, source: 'bundled' },
    { path: join(projectDir, '.claude', 'get-shit-done', 'bin', 'gsd-tools.cjs'), source: 'project' },
    { path: join(homedir(), '.claude', 'get-shit-done', 'bin', 'gsd-tools.cjs'), source: 'user' },
  ];
}

function evaluateNodeVersion(nodeVersion: string, requiredNodeRange: string | null): RuntimeHealthCheck {
  if (!requiredNodeRange) {
    return {
      code: 'node_requirement_missing',
      level: 'warn',
      message: `No Node engine requirement declared for the installed GSD runtime.`,
      fix: 'Declare engines.node in package.json so runtime-health can enforce it.',
    };
  }

  const actual = parseVersionTuple(nodeVersion);
  const minimum = parseMinimumNodeRange(requiredNodeRange);

  if (!actual || !minimum) {
    return {
      code: 'node_requirement_unparsed',
      level: 'warn',
      message: `Unable to validate Node ${nodeVersion} against required range ${requiredNodeRange}.`,
      fix: 'Use a simple >=x.y.z engines.node constraint so runtime-health can enforce it.',
    };
  }

  if (compareVersionTuple(actual, minimum) < 0) {
    return {
      code: 'node_version_unsupported',
      level: 'block',
      message: `Current Node ${nodeVersion} does not satisfy the required runtime ${requiredNodeRange}.`,
      fix: `Use Node ${requiredNodeRange} or newer, then rerun the workflow.`,
    };
  }

  return {
    code: 'node_version_supported',
    level: 'pass',
    message: `Current Node ${nodeVersion} satisfies the required runtime ${requiredNodeRange}.`,
  };
}

async function probeLegacyBridge(
  projectDir: string,
  candidates: RuntimeHealthCandidate[],
): Promise<{ check: RuntimeHealthCheck; path: string | null; source: RuntimeHealthSource; available: boolean }> {
  const candidate = candidates.find(item => existsSync(item.path));

  if (!candidate) {
    return {
      check: {
        code: 'legacy_bridge_missing',
        level: 'warn',
        message: 'No gsd-tools.cjs bridge could be found for CJS fallback commands.',
        fix: 'Run /gsd-update to restore the bundled bridge, or reinstall gsd-remix and @gsd-remix/sdk together.',
      },
      path: null,
      source: 'missing',
      available: false,
    };
  }

  try {
    const { stdout } = await execFileAsync(process.execPath, [candidate.path, 'config-path', '--raw'], {
      cwd: projectDir,
      timeout: 4_000,
      env: process.env,
    });

    const output = String(stdout).trim();
    if (!output) {
      return {
        check: {
          code: 'legacy_bridge_probe_empty',
          level: 'warn',
          message: `Legacy bridge probe returned no output from ${candidate.source} gsd-tools.cjs.`,
          fix: 'Run /gsd-update to refresh the bridge assets before relying on fallback commands.',
          path: candidate.path,
          source: candidate.source,
        },
        path: candidate.path,
        source: candidate.source,
        available: false,
      };
    }

    return {
      check: {
        code: 'legacy_bridge_ready',
        level: 'pass',
        message: `Legacy bridge is available from the ${candidate.source} runtime assets.`,
        path: candidate.path,
        source: candidate.source,
      },
      path: candidate.path,
      source: candidate.source,
      available: true,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      check: {
        code: 'legacy_bridge_probe_failed',
        level: 'warn',
        message: `Legacy bridge probe failed for the ${candidate.source} gsd-tools.cjs.`,
        detail,
        fix: 'Run /gsd-update to refresh bundled assets, then retry the workflow.',
        path: candidate.path,
        source: candidate.source,
      },
      path: candidate.path,
      source: candidate.source,
      available: false,
    };
  }
}

export async function runRuntimeHealth(
  projectDir: string,
  options: RuntimeHealthOptions = {},
): Promise<RuntimeHealthResult> {
  const nodeVersion = options.nodeVersion ?? process.version;
  const requiredNodeRange = options.requiredNodeRange !== undefined
    ? options.requiredNodeRange
    : await loadRequiredNodeRange();
  const gsdToolsCandidates = options.gsdToolsCandidates ?? defaultGsdToolsCandidates(projectDir);

  const nodeCheck = evaluateNodeVersion(nodeVersion, requiredNodeRange);
  const legacyBridge = await probeLegacyBridge(projectDir, gsdToolsCandidates);
  const checks = [nodeCheck, legacyBridge.check];
  const blockers = checks.filter(check => check.level === 'block');
  const warnings = checks.filter(check => check.level === 'warn');

  return {
    passed: blockers.length === 0,
    node_version: nodeVersion,
    required_node_range: requiredNodeRange,
    gsd_tools_path: legacyBridge.path,
    gsd_tools_source: legacyBridge.source,
    legacy_bridge_available: legacyBridge.available,
    checks,
    blockers,
    warnings,
  };
}
