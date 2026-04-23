import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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
    });

    expect(result.passed).toBe(true);
    expect(result.blockers).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.legacy_bridge_available).toBe(true);
    expect(result.gsd_tools_source).toBe('custom');
    expect(result.checks.map(check => check.code)).toEqual([
      'node_version_supported',
      'legacy_bridge_ready',
    ]);
  });

  it('warns when no legacy bridge candidate is available', async () => {
    const { projectDir, cleanup } = await createProject();
    cleanups.push(cleanup);

    const result = await runRuntimeHealth(projectDir, {
      nodeVersion: 'v22.4.1',
      requiredNodeRange: '>=22.0.0',
      gsdToolsCandidates: [{ path: join(projectDir, 'missing-gsd-tools.cjs'), source: 'custom' }],
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
    });

    expect(result.passed).toBe(false);
    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0]?.code).toBe('node_version_unsupported');
  });
});
