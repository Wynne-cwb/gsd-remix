/**
 * Unit tests for plan.execution-route.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { planExecutionRoute } from './plan-execution-route.js';

let tmpDir: string;
let phaseDir: string;

function makeTask(index: number, options?: {
  type?: string;
  files?: string[];
  readFirst?: string[];
  acceptance?: string[];
}): string {
  const type = options?.type ?? 'auto';
  const files = (options?.files ?? [`src/file-${index}.ts`]).join(', ');
  const readFirst = (options?.readFirst ?? []).join(', ');
  const acceptance = options?.acceptance ?? [];
  return `<task type="${type}">
  <name>Task ${index}</name>
  <files>${files}</files>
  <read_first>${readFirst}</read_first>
  <action>Do task ${index}</action>
  <verify>echo ok</verify>
  <acceptance_criteria>
${acceptance.map((criterion) => `    - ${criterion}`).join('\n')}
  </acceptance_criteria>
  <done>done</done>
</task>`;
}

function makePlan(options: {
  autonomous?: boolean;
  filesModified?: string[];
  tasks: string[];
}): string {
  return `---
phase: 09-foundation
plan: "01"
wave: 1
depends_on: []
files_modified: [${(options.filesModified ?? []).join(', ')}]
autonomous: ${options.autonomous ?? true}
---

<objective>
Route this plan
</objective>

<tasks>
${options.tasks.join('\n')}
</tasks>
`;
}

async function writePlan(content: string): Promise<string> {
  const rel = join('.planning', 'phases', '09-x', '09-01-PLAN.md');
  await writeFile(join(tmpDir, rel), content, 'utf-8');
  return rel;
}

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'gsd-per-'));
  phaseDir = join(tmpDir, '.planning', 'phases', '09-x');
  await mkdir(phaseDir, { recursive: true });
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('planExecutionRoute', () => {
  it('uses threshold inline routing for plans at or below the configured threshold', async () => {
    const rel = await writePlan(makePlan({
      filesModified: ['src/a.ts', 'src/b.ts'],
      tasks: [
        makeTask(1, { acceptance: ['criterion 1'] }),
        makeTask(2, { acceptance: ['criterion 2'] }),
      ],
    }));

    const r = await planExecutionRoute([rel, '--inline-threshold', '2'], tmpDir);
    const d = r.data as Record<string, unknown>;

    expect(d.recommended_pattern).toBe('C');
    expect(d.recommended_execution).toBe('main-inline');
    expect(d.reason).toBe('task_count_threshold');
  });

  it('applies low-complexity override for simple 4-task plans above the threshold', async () => {
    const rel = await writePlan(makePlan({
      filesModified: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
      tasks: [
        makeTask(1, { files: ['src/a.ts'], readFirst: ['src/base.ts'], acceptance: ['a1'] }),
        makeTask(2, { files: ['src/b.ts'], acceptance: ['b1'] }),
        makeTask(3, { files: ['src/c.ts'], acceptance: ['c1'] }),
        makeTask(4, { files: ['src/c.ts'], acceptance: ['c2'] }),
      ],
    }));

    const r = await planExecutionRoute([rel, '--inline-threshold', '2'], tmpDir);
    const d = r.data as Record<string, unknown>;

    expect(d.low_complexity_inline).toBe(true);
    expect(d.recommended_pattern).toBe('C');
    expect(d.reason).toBe('low_complexity_override');
  });

  it('keeps complex 4-task plans on the subagent route', async () => {
    const rel = await writePlan(makePlan({
      filesModified: ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts', 'src/e.ts'],
      tasks: [
        makeTask(1, { files: ['src/a.ts'], readFirst: ['src/r1.ts', 'src/r2.ts'], acceptance: ['a1', 'a2'] }),
        makeTask(2, { files: ['src/b.ts'], readFirst: ['src/r3.ts', 'src/r4.ts'], acceptance: ['b1', 'b2'] }),
        makeTask(3, { files: ['src/c.ts'], readFirst: ['src/r5.ts'], acceptance: ['c1'] }),
        makeTask(4, { files: ['src/d.ts', 'src/e.ts'], acceptance: ['d1'] }),
      ],
    }));

    const r = await planExecutionRoute([rel, '--inline-threshold', '2'], tmpDir);
    const d = r.data as Record<string, unknown>;

    expect(d.low_complexity_inline).toBe(false);
    expect(d.recommended_pattern).toBe('A');
    expect(d.reason).toBe('autonomous_default');
  });

  it('routes verify-only checkpoints to segmented execution', async () => {
    const rel = await writePlan(makePlan({
      tasks: [
        makeTask(1),
        makeTask(2, { type: 'checkpoint:human-verify' }),
        makeTask(3),
      ],
    }));

    const r = await planExecutionRoute([rel, '--inline-threshold', '2'], tmpDir);
    const d = r.data as Record<string, unknown>;

    expect(d.checkpoint_mode).toBe('verify_only');
    expect(d.recommended_pattern).toBe('B');
    expect(d.reason).toBe('verify_checkpoints');
  });

  it('routes decision checkpoints to main inline execution', async () => {
    const rel = await writePlan(makePlan({
      tasks: [
        makeTask(1),
        makeTask(2, { type: 'checkpoint:decision' }),
        makeTask(3),
      ],
    }));

    const r = await planExecutionRoute([rel, '--inline-threshold', '2'], tmpDir);
    const d = r.data as Record<string, unknown>;

    expect(d.checkpoint_mode).toBe('decision_or_action');
    expect(d.recommended_pattern).toBe('C');
    expect(d.reason).toBe('decision_checkpoint');
  });
});
