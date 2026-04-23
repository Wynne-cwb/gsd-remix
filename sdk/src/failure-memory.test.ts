import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { promoteFailureMemory, recordPhaseArtifactFailureEvents, recordPlanResultFailure, runFailurePreflight } from './failure-memory.js';
import { failureCapturePhase, failurePreflight, failurePromotePhase } from './query/failure-capture.js';
import type { PlanResult } from './types.js';

async function createProject(): Promise<{ projectDir: string; cleanup: () => Promise<void> }> {
  const projectDir = await mkdtemp(join(tmpdir(), 'gsd-failure-memory-'));
  await mkdir(join(projectDir, '.planning', 'phases', '01-auth'), { recursive: true });
  return {
    projectDir,
    cleanup: () => rm(projectDir, { recursive: true, force: true }),
  };
}

async function readEvents(projectDir: string): Promise<Array<Record<string, unknown>>> {
  const logPath = join(projectDir, '.planning', 'failure-memory', 'events.jsonl');
  const content = await readFile(logPath, 'utf-8');
  return content
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as Record<string, unknown>);
}

async function readJsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf-8')) as T;
}

describe('failure-memory', () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(cleanups.splice(0).map(fn => fn()));
  });

  it('records phase artifact failure signals into events.jsonl', async () => {
    const { projectDir, cleanup } = await createProject();
    cleanups.push(cleanup);

    const phaseDir = join(projectDir, '.planning', 'phases', '01-auth');
    await writeFile(
      join(phaseDir, '01-auth-01-SUMMARY.md'),
      `# Summary

## Issues Encountered
- pnpm install failed because npm lockfile was stale

## Self-Check: FAILED
- acceptance criteria 2 not verified
`,
      'utf-8',
    );
    await writeFile(
      join(phaseDir, '01-VERIFICATION.md'),
      `---
phase: 01-auth
status: gaps_found
score: 0/1 must-haves verified
---

# Verification
`,
      'utf-8',
    );
    await writeFile(
      join(phaseDir, '.continue-here.md'),
      `# BLOCKING CONSTRAINTS — Read Before Anything Else

## Critical Anti-Patterns

| Pattern | Description | Severity | Prevention Mechanism |
|---------|-------------|----------|----------------------|
| Wrong package manager | Used npm instead of pnpm for this repo | blocking | Detect packageManager field before install |
`,
      'utf-8',
    );

    const events = await recordPhaseArtifactFailureEvents(projectDir, {
      phaseNumber: '01',
      phaseName: 'Authentication',
      phaseDir,
    });

    expect(events.map(event => event.kind).sort()).toEqual([
      'blocking_antipattern',
      'summary_issue',
      'summary_self_check',
      'verification_status',
    ]);

    const persisted = await readEvents(projectDir);
    expect(persisted).toHaveLength(4);
    expect(persisted.every(event => event.phase_number === '01')).toBe(true);
  });

  it('deduplicates identical phase artifact failure events across repeated capture', async () => {
    const { projectDir, cleanup } = await createProject();
    cleanups.push(cleanup);

    const phaseDir = join(projectDir, '.planning', 'phases', '01-auth');
    await writeFile(
      join(phaseDir, '01-auth-01-SUMMARY.md'),
      `# Summary

## Issues Encountered
- pnpm install failed because npm lockfile was stale
`,
      'utf-8',
    );

    await recordPhaseArtifactFailureEvents(projectDir, {
      phaseNumber: '01',
      phaseName: 'Authentication',
      phaseDir,
    });
    await recordPhaseArtifactFailureEvents(projectDir, {
      phaseNumber: '01',
      phaseName: 'Authentication',
      phaseDir,
    });

    const persisted = await readEvents(projectDir);
    expect(persisted).toHaveLength(1);
  });

  it('records session failures with usage metadata', async () => {
    const { projectDir, cleanup } = await createProject();
    cleanups.push(cleanup);

    const result: PlanResult = {
      success: false,
      sessionId: 'sess-failure',
      totalCostUsd: 0.12,
      durationMs: 950,
      usage: {
        inputTokens: 1200,
        outputTokens: 140,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
      numTurns: 7,
      error: {
        subtype: 'error_during_execution',
        messages: ['Node version mismatch'],
      },
    };

    await recordPlanResultFailure(
      projectDir,
      {
        phaseNumber: '01',
        phaseName: 'Authentication',
        phaseDir: join(projectDir, '.planning', 'phases', '01-auth'),
        step: 'execute',
      },
      result,
    );

    const [event] = await readEvents(projectDir);
    expect(event.kind).toBe('session_error');
    expect(event.error_subtype).toBe('error_during_execution');
    expect(event.num_turns).toBe(7);
    expect((event.usage as Record<string, unknown>).inputTokens).toBe(1200);
  });

  it('captures phase failures through the query handler', async () => {
    const { projectDir, cleanup } = await createProject();
    cleanups.push(cleanup);

    const phaseDir = join(projectDir, '.planning', 'phases', '01-auth');
    await writeFile(
      join(phaseDir, '01-VERIFICATION.md'),
      `---
phase: 01-auth
status: human_needed
---
`,
      'utf-8',
    );

    const result = await failureCapturePhase(['1'], projectDir);

    expect(result.data).toMatchObject({
      phase: '01',
      captured: 1,
      counts: {
        verification_status: 1,
      },
    });
  });

  it('promotes repeated failure signatures into long-lived failure memories', async () => {
    const { projectDir, cleanup } = await createProject();
    cleanups.push(cleanup);

    const secondPhaseDir = join(projectDir, '.planning', 'phases', '02-payments');
    await mkdir(secondPhaseDir, { recursive: true });

    const repeatedResult = (phaseNumber: string): PlanResult => ({
      success: false,
      sessionId: `sess-${phaseNumber}`,
      totalCostUsd: 0.08,
      durationMs: 600,
      usage: {
        inputTokens: 400,
        outputTokens: 80,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
      numTurns: 4,
      error: {
        subtype: 'error_during_execution',
        messages: ['Node version mismatch'],
      },
    });

    await recordPlanResultFailure(
      projectDir,
      {
        phaseNumber: '01',
        phaseName: 'Authentication',
        phaseDir: join(projectDir, '.planning', 'phases', '01-auth'),
        step: 'execute',
      },
      repeatedResult('01'),
    );
    await recordPlanResultFailure(
      projectDir,
      {
        phaseNumber: '02',
        phaseName: 'Payments',
        phaseDir: secondPhaseDir,
        step: 'execute',
      },
      repeatedResult('02'),
    );

    const promotion = await promoteFailureMemory(projectDir, '02');
    expect(promotion.promoted_entry_ids).toHaveLength(1);

    const index = await readJsonFile<{ entries: Array<Record<string, unknown>> }>(
      join(projectDir, '.planning', 'failure-memory', 'index.json'),
    );
    expect(index.entries).toHaveLength(1);
    expect(index.entries[0]).toMatchObject({
      status: 'promoted',
      evidence_count: 2,
      kind: 'session_error',
    });

    const detailId = String(index.entries[0].id);
    const detailContent = await readFile(
      join(projectDir, '.planning', 'failure-memory', `${detailId}.md`),
      'utf-8',
    );
    expect(detailContent).toContain('Node version mismatch');

    const overview = await readFile(join(projectDir, '.planning', 'FAILURE-MEMORY.md'), 'utf-8');
    expect(overview).toContain(detailId);
  });

  it('promotes phase failures through the query handler', async () => {
    const { projectDir, cleanup } = await createProject();
    cleanups.push(cleanup);

    const phaseDir = join(projectDir, '.planning', 'phases', '01-auth');
    await writeFile(
      join(phaseDir, '.continue-here.md'),
      `# BLOCKING CONSTRAINTS — Read Before Anything Else

## Critical Anti-Patterns

| Pattern | Description | Severity | Prevention Mechanism |
|---------|-------------|----------|----------------------|
| Wrong package manager | Used npm instead of pnpm for this repo | blocking | Detect packageManager field before install |
`,
      'utf-8',
    );

    await failureCapturePhase(['01'], projectDir);
    const result = await failurePromotePhase(['01'], projectDir);

    expect(result.data).toMatchObject({
      phase: '01',
      entries: 1,
      promoted_entry_ids: ['FM-001'],
    });
  });

  it('builds package-manager preflight warnings from promoted memories', async () => {
    const { projectDir, cleanup } = await createProject();
    cleanups.push(cleanup);

    const phaseDir = join(projectDir, '.planning', 'phases', '01-auth');
    await writeFile(
      join(projectDir, 'package.json'),
      JSON.stringify({ name: 'demo', packageManager: 'pnpm@9.0.0' }, null, 2),
      'utf-8',
    );
    await writeFile(join(projectDir, 'package-lock.json'), '{}', 'utf-8');
    await writeFile(
      join(phaseDir, '.continue-here.md'),
      `# BLOCKING CONSTRAINTS — Read Before Anything Else

## Critical Anti-Patterns

| Pattern | Description | Severity | Prevention Mechanism |
|---------|-------------|----------|----------------------|
| Wrong package manager | Used npm instead of pnpm for this repo | blocking | Detect packageManager field before install |
`,
      'utf-8',
    );

    await failureCapturePhase(['01'], projectDir);
    await failurePromotePhase(['01'], projectDir);

    const result = await runFailurePreflight(projectDir);
    expect(result.passed).toBe(true);
    expect(result.recommended_package_manager).toBe('pnpm');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({
      id: 'package_manager_consistency',
    });
  });

  it('blocks execute preflight when promoted node mismatch memory conflicts with repo runtime', async () => {
    const { projectDir, cleanup } = await createProject();
    cleanups.push(cleanup);

    await writeFile(join(projectDir, '.nvmrc'), '999.0.0\n', 'utf-8');

    const repeatedResult = (): PlanResult => ({
      success: false,
      sessionId: 'sess-node',
      totalCostUsd: 0.08,
      durationMs: 600,
      usage: {
        inputTokens: 400,
        outputTokens: 80,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
      numTurns: 4,
      error: {
        subtype: 'error_during_execution',
        messages: ['Node version mismatch'],
      },
    });

    await recordPlanResultFailure(
      projectDir,
      {
        phaseNumber: '01',
        phaseName: 'Authentication',
        phaseDir: join(projectDir, '.planning', 'phases', '01-auth'),
        step: 'execute',
      },
      repeatedResult(),
    );
    await recordPlanResultFailure(
      projectDir,
      {
        phaseNumber: '02',
        phaseName: 'Payments',
        phaseDir: join(projectDir, '.planning', 'phases', '01-auth'),
        step: 'execute',
      },
      repeatedResult(),
    );
    await promoteFailureMemory(projectDir);

    const result = await failurePreflight([], projectDir);
    expect(result.data).toMatchObject({
      passed: false,
      blockers: [
        {
          id: 'node_runtime_alignment',
        },
      ],
    });
  });

  it('blocks execute preflight when promoted failure memory references missing package scripts', async () => {
    const { projectDir, cleanup } = await createProject();
    cleanups.push(cleanup);

    const phaseDir = join(projectDir, '.planning', 'phases', '01-auth');
    await writeFile(
      join(projectDir, 'package.json'),
      JSON.stringify({ name: 'demo', scripts: { test: 'vitest' } }, null, 2),
      'utf-8',
    );
    await writeFile(
      join(phaseDir, '.continue-here.md'),
      `# BLOCKING CONSTRAINTS — Read Before Anything Else

## Critical Anti-Patterns

| Pattern | Description | Severity | Prevention Mechanism |
|---------|-------------|----------|----------------------|
| Missing build script | Ran npm run build but the build script was missing from package.json | blocking | Add a build script entry before execute |
`,
      'utf-8',
    );

    await failureCapturePhase(['01'], projectDir);
    await failurePromotePhase(['01'], projectDir);

    const result = await failurePreflight([], projectDir);
    expect(result.data).toMatchObject({
      passed: false,
      blockers: [
        {
          id: 'script_entry_readiness',
        },
      ],
    });
  });

  it('warns execute preflight when promoted env memory detects missing template variables', async () => {
    const { projectDir, cleanup } = await createProject();
    cleanups.push(cleanup);

    const phaseDir = join(projectDir, '.planning', 'phases', '01-auth');
    await writeFile(join(projectDir, '.env.example'), 'API_KEY=\nNEXT_PUBLIC_URL=\n', 'utf-8');
    await writeFile(join(projectDir, '.env'), 'NEXT_PUBLIC_URL=https://example.com\n', 'utf-8');
    await writeFile(
      join(phaseDir, '.continue-here.md'),
      `# BLOCKING CONSTRAINTS — Read Before Anything Else

## Critical Anti-Patterns

| Pattern | Description | Severity | Prevention Mechanism |
|---------|-------------|----------|----------------------|
| Missing env setup | Missing API_KEY in environment caused startup failure | blocking | Populate .env.example variables before running commands |
`,
      'utf-8',
    );

    await failureCapturePhase(['01'], projectDir);
    await failurePromotePhase(['01'], projectDir);

    const result = await runFailurePreflight(projectDir);
    expect(result.passed).toBe(true);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'env_setup_readiness',
        }),
      ]),
    );
  });
});
