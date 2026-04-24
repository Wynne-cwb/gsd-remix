import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { detectRuntime, getRuntimeConfigDir, type Runtime } from './query/helpers.js';

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
  runtime_identity: RuntimeIdentity | null;
  runtime_identity_path: string | null;
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
  runtimeIdentityPath?: string | null;
  runtime?: Runtime;
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

export interface RuntimeIdentity {
  distribution?: string;
  package_name?: string;
  version?: string;
  display_name?: string;
  sdk_binary?: string;
  sdk_package?: string;
  runtime?: string;
  install_scope?: string;
  installed_at?: string;
  identity_path: string;
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

async function loadProjectRuntimeConfig(projectDir: string): Promise<{ runtime?: unknown } | undefined> {
  try {
    const parsed = JSON.parse(await readFile(join(projectDir, '.planning', 'config.json'), 'utf-8')) as {
      runtime?: unknown;
    };
    return parsed;
  } catch {
    return undefined;
  }
}

function getLocalRuntimeDirName(runtime: Runtime): string {
  switch (runtime) {
    case 'copilot':
      return '.github';
    case 'opencode':
      return '.opencode';
    case 'kilo':
      return '.kilo';
    case 'codex':
      return '.codex';
    case 'antigravity':
      return '.agent';
    case 'cursor':
      return '.cursor';
    case 'windsurf':
      return '.windsurf';
    case 'augment':
      return '.augment';
    case 'trae':
      return '.trae';
    case 'qwen':
      return '.qwen';
    case 'codebuddy':
      return '.codebuddy';
    case 'cline':
      return '.cline';
    case 'gemini':
      return '.gemini';
    case 'claude':
      return '.claude';
  }
}

function defaultGsdToolsCandidates(projectDir: string, runtime: Runtime): RuntimeHealthCandidate[] {
  return [
    { path: join(projectDir, getLocalRuntimeDirName(runtime), 'get-shit-done', 'bin', 'gsd-tools.cjs'), source: 'project' },
    { path: join(getRuntimeConfigDir(runtime), 'get-shit-done', 'bin', 'gsd-tools.cjs'), source: 'user' },
    { path: BUNDLED_GSD_TOOLS_PATH, source: 'bundled' },
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
        fix: 'Run /gsd-update to restore the bundled bridge. Use /gsd-health --runtime --repair only for SDK CLI repair.',
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

function identityPathForBridgePath(gsdToolsPath: string | null): string | null {
  if (!gsdToolsPath) {
    return null;
  }

  return join(dirname(dirname(gsdToolsPath)), 'IDENTITY.json');
}

async function loadRuntimeIdentity(identityPath: string | null): Promise<RuntimeIdentity | null> {
  if (!identityPath) {
    return null;
  }

  try {
    const parsed = JSON.parse(await readFile(identityPath, 'utf-8')) as Omit<RuntimeIdentity, 'identity_path'>;
    return {
      ...parsed,
      identity_path: identityPath,
    };
  } catch {
    return null;
  }
}

function evaluateRuntimeIdentity(identity: RuntimeIdentity | null, identityPath: string | null): RuntimeHealthCheck {
  if (!identity) {
    return {
      code: 'runtime_identity_missing',
      level: 'warn',
      message: 'No GSD Remix identity marker was found next to the resolved runtime assets.',
      detail: identityPath ? `Expected identity marker at ${identityPath}.` : undefined,
      fix: 'Run npx gsd-remix@latest for this runtime, then rerun /gsd-health --runtime.',
    };
  }

  if (identity.distribution !== 'gsd-remix' || identity.package_name !== 'gsd-remix') {
    return {
      code: 'runtime_identity_unexpected',
      level: 'warn',
      message: `Resolved runtime identity is ${identity.display_name ?? identity.distribution ?? 'unknown'}, not GSD Remix.`,
      detail: `Identity file: ${identity.identity_path}`,
      fix: 'Reinstall with npx gsd-remix@latest for the selected runtime, then rerun /gsd-health --runtime.',
    };
  }

  return {
    code: 'runtime_identity_verified',
    level: 'pass',
    message: `Resolved runtime identity is GSD Remix ${identity.version ?? 'unknown version'}.`,
    path: identity.identity_path,
  };
}

export async function runRuntimeHealth(
  projectDir: string,
  options: RuntimeHealthOptions = {},
): Promise<RuntimeHealthResult> {
  const nodeVersion = options.nodeVersion ?? process.version;
  const requiredNodeRange = options.requiredNodeRange !== undefined
    ? options.requiredNodeRange
    : await loadRequiredNodeRange();
  const runtime = options.runtime ?? detectRuntime(await loadProjectRuntimeConfig(projectDir));
  const gsdToolsCandidates = options.gsdToolsCandidates ?? defaultGsdToolsCandidates(projectDir, runtime);

  const nodeCheck = evaluateNodeVersion(nodeVersion, requiredNodeRange);
  const legacyBridge = await probeLegacyBridge(projectDir, gsdToolsCandidates);
  const identityPath = options.runtimeIdentityPath !== undefined
    ? options.runtimeIdentityPath
    : identityPathForBridgePath(legacyBridge.path);
  const runtimeIdentity = await loadRuntimeIdentity(identityPath);
  const identityCheck = evaluateRuntimeIdentity(runtimeIdentity, identityPath);
  const checks = [nodeCheck, legacyBridge.check, identityCheck];
  const blockers = checks.filter(check => check.level === 'block');
  const warnings = checks.filter(check => check.level === 'warn');

  return {
    passed: blockers.length === 0,
    node_version: nodeVersion,
    required_node_range: requiredNodeRange,
    runtime_identity: runtimeIdentity,
    runtime_identity_path: identityPath,
    gsd_tools_path: legacyBridge.path,
    gsd_tools_source: legacyBridge.source,
    legacy_bridge_available: legacyBridge.available,
    checks,
    blockers,
    warnings,
  };
}
