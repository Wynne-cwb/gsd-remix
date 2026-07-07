import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { routeEscalate } from './route-escalate.js';

async function makeProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'gsd-esc-'));
  await mkdir(join(dir, '.planning', 'phases'), { recursive: true });
  await writeFile(
    join(dir, '.planning', 'ROADMAP.md'),
    '# Roadmap\n\n## Milestone v1\n\n### Phase 1: Existing\n\n**Goal:** done\n\n---\n',
    'utf-8',
  );
  await writeFile(
    join(dir, '.planning', 'STATE.md'),
    '# State\n\n**Current Phase:** 1\n**Current Phase Name:** Existing\n**Status:** In progress\n',
    'utf-8',
  );
  return dir;
}

async function makeQuick(dir: string, id = '250706-abc', slug = 'add-cache'): Promise<void> {
  const qd = join(dir, '.planning', 'quick', `${id}-${slug}`);
  await mkdir(qd, { recursive: true });
  await writeFile(join(qd, `${id}-CONTEXT.md`), '---\ntype: quick\n---\n\n## Decisions\n- Use an LRU cache\n', 'utf-8');
  await writeFile(join(qd, `${id}-PLAN.md`), '---\nwave: 1\n---\n\n## Task\nAdd cache layer\n', 'utf-8');
}

describe('routeEscalate — quick → heavy migration', () => {
  it('accepted_prior_work: creates a phase, seeds CONTEXT (no PLAN), updates STATE, routes to plan', async () => {
    const dir = await makeProject();
    await makeQuick(dir);
    const { data } = await routeEscalate(['250706-abc', '--evidence', 'accepted_prior_work'], dir) as { data: Record<string, unknown> };

    expect(data.evidence_status).toBe('accepted_prior_work');
    expect(data.routed_to).toBe('plan');
    expect(data.reverted_code).toBe(false);

    const phaseDir = join(dir, data.phase_dir as string);
    expect(existsSync(phaseDir)).toBe(true);
    // CONTEXT.md exists...
    const ctxPath = join(dir, data.context_path as string);
    expect(existsSync(ctxPath)).toBe(true);
    // ...and NO PLAN.md (so gsd-next routes to plan, not verify)
    const { readdir } = await import('node:fs/promises');
    const files = await readdir(phaseDir);
    expect(files.some((f) => /-PLAN\.md$/.test(f))).toBe(false);

    const ctx = await readFile(ctxPath, 'utf-8');
    expect(ctx).toMatch(/evidence_status: accepted_prior_work/);
    expect(ctx).toMatch(/Prior Work/);

    const state = await readFile(join(dir, '.planning', 'STATE.md'), 'utf-8');
    expect(state).toMatch(/\*\*Current Phase:\*\*\s*2/);
    expect(data.state_updated).toContain('Current Phase');
  });

  it('suspect_prior_work: CONTEXT instructs re-review, not normalization', async () => {
    const dir = await makeProject();
    await makeQuick(dir);
    const { data } = await routeEscalate(['250706-abc', '--evidence', 'suspect_prior_work'], dir) as { data: Record<string, unknown> };
    const ctx = await readFile(join(dir, data.context_path as string), 'utf-8');
    expect(ctx).toMatch(/SUSPECT|re-review/i);
    expect(data.revert_recommended).toBe(false);
  });

  it('revert_recommended: flags revert, still never reverts committed code', async () => {
    const dir = await makeProject();
    await makeQuick(dir);
    const { data } = await routeEscalate(['250706-abc', '--evidence', 'revert_recommended'], dir) as { data: Record<string, unknown> };
    expect(data.revert_recommended).toBe(true);
    expect(data.reverted_code).toBe(false);
    const ctx = await readFile(join(dir, data.context_path as string), 'utf-8');
    expect(ctx).toMatch(/gsd-undo|revert plan/i);
  });

  it('failure: unknown quick task throws', async () => {
    const dir = await makeProject();
    await makeQuick(dir);
    await expect(routeEscalate(['999999-nope', '--evidence', 'accepted_prior_work'], dir)).rejects.toThrow(/not found/i);
  });

  it('failure: invalid evidence status throws', async () => {
    const dir = await makeProject();
    await makeQuick(dir);
    await expect(routeEscalate(['250706-abc', '--evidence', 'bogus'], dir)).rejects.toThrow(/evidence must be one of/i);
  });

  it('failure: missing quick id throws', async () => {
    const dir = await makeProject();
    await expect(routeEscalate(['--evidence', 'accepted_prior_work'], dir)).rejects.toThrow(/requires a quick task/i);
  });

  it('security: a path escaping .planning/quick/ is rejected, not followed', async () => {
    const dir = await makeProject();
    // A real quick dir OUTSIDE the project, reachable via ".." traversal.
    const external = join(dir, '..', `external-quick-${Date.now?.() ?? 'x'}`);
    await mkdir(external, { recursive: true });
    await writeFile(join(external, '250706-abc-CONTEXT.md'), '---\ntype: quick\n---\n\n## Decisions\n- external\n', 'utf-8');
    await writeFile(join(external, '250706-abc-PLAN.md'), '---\nwave: 1\n---\n\n## Task\nexternal\n', 'utf-8');

    const rel = join('..', external.split('/').pop() as string);
    await expect(routeEscalate([rel, '--evidence', 'accepted_prior_work'], dir))
      .rejects.toThrow(/not found|nothing to escalate/i);
  });

  it('security: a symlink inside .planning/quick/ pointing outside is rejected', async () => {
    const dir = await makeProject();
    const { symlink, mkdir: mkdirp, writeFile: wf } = await import('node:fs/promises');
    // Real quick target OUTSIDE the repo.
    const external = join(dir, '..', `ext-quick-tgt-${Date.now?.() ?? 'x'}`);
    await mkdirp(external, { recursive: true });
    await wf(join(external, '250706-abc-CONTEXT.md'), '---\ntype: quick\n---\n\n## Decisions\n- external\n', 'utf-8');
    // A symlink inside .planning/quick/ that points at the external dir.
    await mkdirp(join(dir, '.planning', 'quick'), { recursive: true });
    const link = join(dir, '.planning', 'quick', '250706-abc-link');
    await symlink(external, link);

    await expect(routeEscalate(['.planning/quick/250706-abc-link', '--evidence', 'accepted_prior_work'], dir))
      .rejects.toThrow(/escapes|not found/i);
  });
});
