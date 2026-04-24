import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runRuntimeHealth } from './runtime-health.js';

async function createProject(): Promise<{ projectDir: string; cleanup: () => Promise<void> }> {
  const projectDir = await mkdtemp(join(tmpdir(), 'gsd-runtime-health-'));
  return {
    projectDir,
    cleanup: () => rm(projectDir, { recursive: true, force: true }),
  };
}

async function createNodeScript(projectDir: string, name: string, body: string): Promise<string> {
  const filePath = join(projectDir, name);
  await writeFile(filePath, body, 'utf-8');
  return filePath;
}

async function createIdentity(dir: string, extra: Record<string, unknown> = {}): Promise<string> {
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, 'IDENTITY.json');
  await writeFile(filePath, JSON.stringify({
    distribution: 'gsd-remix',
    package_name: 'gsd-remix',
    version: '1.37.1',
    display_name: 'GSD Remix',
    ...extra,
  }), 'utf-8');
  return filePath;
}

describe('runtime-health', () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(cleanups.splice(0).map(fn => fn()));
  });

  it('passes when node version is supported and the legacy bridge probe succeeds', async () => {
    const { projectDir, cleanup } = await createProject();
    cleanups.push(cleanup);

    const bridgePath = await createNodeScript(
      projectDir,
      'gsd-tools-ok.cjs',
      `process.stdout.write('/tmp/config.json\\n');`,
    );

    const result = await runRuntimeHealth(projectDir, {
      nodeVersion: 'v22.4.1',
      requiredNodeRange: '>=22.0.0',
      gsdToolsCandidates: [{ path: bridgePath, source: 'custom' }],
      runtimeIdentityPath: await createIdentity(projectDir),
    });

    expect(result.passed).toBe(true);
    expect(result.blockers).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.runtime_identity?.package_name).toBe('gsd-remix');
    expect(result.legacy_bridge_available).toBe(true);
    expect(result.gsd_tools_source).toBe('custom');
    expect(result.checks.map(check => check.code)).toEqual([
      'node_version_supported',
      'legacy_bridge_ready',
      'runtime_identity_verified',
    ]);
  });

  it('warns when no legacy bridge candidate is available', async () => {
    const { projectDir, cleanup } = await createProject();
    cleanups.push(cleanup);

    const result = await runRuntimeHealth(projectDir, {
      nodeVersion: 'v22.4.1',
      requiredNodeRange: '>=22.0.0',
      gsdToolsCandidates: [{ path: join(projectDir, 'missing-gsd-tools.cjs'), source: 'custom' }],
      runtimeIdentityPath: await createIdentity(projectDir),
    });

    expect(result.passed).toBe(true);
    expect(result.legacy_bridge_available).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.code).toBe('legacy_bridge_missing');
  });

  it('warns when the legacy bridge probe fails', async () => {
    const { projectDir, cleanup } = await createProject();
    cleanups.push(cleanup);

    const bridgePath = await createNodeScript(
      projectDir,
      'gsd-tools-fail.cjs',
      `process.stderr.write('bridge probe failed\\n'); process.exit(1);`,
    );

    const result = await runRuntimeHealth(projectDir, {
      nodeVersion: 'v22.4.1',
      requiredNodeRange: '>=22.0.0',
      gsdToolsCandidates: [{ path: bridgePath, source: 'custom' }],
      runtimeIdentityPath: await createIdentity(projectDir),
    });

    expect(result.passed).toBe(true);
    expect(result.legacy_bridge_available).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.code).toBe('legacy_bridge_probe_failed');
  });

  it('blocks when the current node version is below the required runtime', async () => {
    const { projectDir, cleanup } = await createProject();
    cleanups.push(cleanup);

    const bridgePath = await createNodeScript(
      projectDir,
      'gsd-tools-ok.cjs',
      `process.stdout.write('/tmp/config.json\\n');`,
    );

    const result = await runRuntimeHealth(projectDir, {
      nodeVersion: 'v20.11.1',
      requiredNodeRange: '>=22.0.0',
      gsdToolsCandidates: [{ path: bridgePath, source: 'custom' }],
      runtimeIdentityPath: await createIdentity(projectDir),
    });

    expect(result.passed).toBe(false);
    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0]?.code).toBe('node_version_unsupported');
  });

  it('warns when the remix identity marker is missing', async () => {
    const { projectDir, cleanup } = await createProject();
    cleanups.push(cleanup);

    const bridgePath = await createNodeScript(
      projectDir,
      'gsd-tools-ok.cjs',
      `process.stdout.write('/tmp/config.json\\n');`,
    );

    const result = await runRuntimeHealth(projectDir, {
      nodeVersion: 'v22.4.1',
      requiredNodeRange: '>=22.0.0',
      gsdToolsCandidates: [{ path: bridgePath, source: 'custom' }],
      runtimeIdentityPath: join(projectDir, 'missing-IDENTITY.json'),
    });

    expect(result.passed).toBe(true);
    expect(result.runtime_identity).toBeNull();
    expect(result.warnings.some(warning => warning.code === 'runtime_identity_missing')).toBe(true);
  });

  it('resolves project-local runtime assets for non-Claude runtimes', async () => {
    const { projectDir, cleanup } = await createProject();
    cleanups.push(cleanup);

    const runtimeRoot = join(projectDir, '.codex', 'get-shit-done');
    const bridgeDir = join(runtimeRoot, 'bin');
    await mkdir(bridgeDir, { recursive: true });
    await writeFile(join(bridgeDir, 'gsd-tools.cjs'), `process.stdout.write('/tmp/config.json\\n');`, 'utf-8');
    await createIdentity(runtimeRoot, { runtime: 'codex', install_scope: 'local' });

    const result = await runRuntimeHealth(projectDir, {
      nodeVersion: 'v22.4.1',
      requiredNodeRange: '>=22.0.0',
      runtime: 'codex',
    });

    expect(result.gsd_tools_source).toBe('project');
    expect(result.runtime_identity?.runtime).toBe('codex');
    expect(result.checks.some(check => check.code === 'runtime_identity_verified')).toBe(true);
  });
});
